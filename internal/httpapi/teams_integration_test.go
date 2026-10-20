package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/database"
	"signing-platform/internal/envelope"
	"signing-platform/internal/folder"
	"signing-platform/internal/identity"
)

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/httpapi -run Integration
func TestIntegrationTeams(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)

	suffix := time.Now().Format("150405.000000")
	user := func(name string) string {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, strings.ToLower(strings.ReplaceAll(name, " ", "-"))+"-"+suffix+"@example.com", name).Scan(&id); err != nil {
			t.Fatalf("insert user: %v", err)
		}
		return id
	}
	ownerID, salesRepID, otherID := user("Owner"), user("Sales Rep"), user("Other")
	var orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Teams Test', $1) RETURNING id::text`, "teams-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	for id, role := range map[string]string{ownerID: "owner", salesRepID: "member", otherID: "member"} {
		if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3)`, orgID, id, role); err != nil {
			t.Fatalf("insert membership: %v", err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, []string{ownerID, salesRepID, otherID})
	})

	store := identity.NewPostgresStore(pool)
	session := func(userID, role string) identity.Session {
		s := identity.Session{User: identity.User{ID: userID}, Workspace: identity.Workspace{ID: orgID, Role: role}}
		team, err := store.ResolveTeam(ctx, userID, orgID, role, "")
		if err != nil {
			t.Fatalf("resolve default team: %v", err)
		}
		s.Team = team
		return s
	}
	owner, salesRep, other := session(ownerID, "owner"), session(salesRepID, "member"), session(otherID, "member")

	// The organization got its default team from the database trigger.
	if owner.Team.ID == "" || !owner.Team.IsDefault || owner.Team.Name != "General" || salesRep.Team.ID != owner.Team.ID {
		t.Fatalf("default team: owner %+v, member %+v", owner.Team, salesRep.Team)
	}
	general := owner.Team.ID

	access := &teamAccess{db: pool}
	router := chi.NewRouter()
	router.Route("/teams", access.routes)
	call := func(s identity.Session, method, path, body string) (int, map[string]any) {
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(identity.ContextWithSession(ctx, s))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}

	// Only workspace owners and admins create teams.
	if code, _ := call(salesRep, http.MethodPost, "/teams/", `{"name":"Sales"}`); code != http.StatusForbidden {
		t.Fatalf("member creating a team: %d", code)
	}
	code, created := call(owner, http.MethodPost, "/teams/", `{"name":"Sales"}`)
	if code != http.StatusCreated {
		t.Fatalf("create team: %d %v", code, created)
	}
	sales := created["id"].(string)
	if code, _ := call(owner, http.MethodPost, "/teams/", `{"name":"Sales"}`); code != http.StatusConflict {
		t.Fatalf("duplicate team name: %d", code)
	}

	// A member can't use a team they're not on.
	if _, err := store.ResolveTeam(ctx, salesRepID, orgID, "member", sales); !errors.Is(err, identity.ErrTeamNotFound) {
		t.Fatalf("member resolving Sales before joining: %v", err)
	}
	if code, _ := call(salesRep, http.MethodGet, "/teams/"+sales, ""); code != http.StatusNotFound {
		t.Fatalf("member reading Sales before joining: %d", code)
	}
	if code, _ := call(owner, http.MethodPut, "/teams/"+sales+"/members/"+salesRepID, `{"role":"member"}`); code != http.StatusOK {
		t.Fatalf("add member: %d", code)
	}
	if code, _ := call(owner, http.MethodPut, "/teams/"+general+"/members/"+salesRepID, `{"role":"member"}`); code != http.StatusConflict {
		t.Fatalf("adding to the default team: %d", code)
	}
	salesTeam, err := store.ResolveTeam(ctx, salesRepID, orgID, "member", sales)
	if err != nil || salesTeam.Role != "member" {
		t.Fatalf("member resolving Sales after joining: %+v %v", salesTeam, err)
	}
	inSales := salesRep
	inSales.Team = salesTeam

	// Team lists: the other member only sees General.
	_, list := call(other, http.MethodGet, "/teams/", "")
	if teams := list["data"].([]any); len(teams) != 1 || teams[0].(map[string]any)["id"] != general {
		t.Fatalf("other member's teams: %v", list)
	}
	_, list = call(owner, http.MethodGet, "/teams/", "")
	if teams := list["data"].([]any); len(teams) != 2 {
		t.Fatalf("owner's teams: %v", list)
	}

	// Envelopes are created in, and listed by, the request's team.
	envelopes := envelope.NewService(envelope.NewPostgresStore(pool))
	inGeneral, err := envelopes.Create(ctx, orgID, ownerID, envelope.CreateInput{Title: "General doc", TeamID: general})
	if err != nil {
		t.Fatalf("create in General: %v", err)
	}
	salesDoc, err := envelopes.Create(ctx, orgID, salesRepID, envelope.CreateInput{Title: "Sales doc", TeamID: sales})
	if err != nil {
		t.Fatalf("create in Sales: %v", err)
	}
	foreign, err := envelopes.Create(ctx, orgID, ownerID, envelope.CreateInput{Title: "Bad team", TeamID: "00000000-0000-0000-0000-000000000000"})
	if err != nil {
		t.Fatalf("create with a foreign team: %v", err)
	}
	listed := func(teamID string) []string {
		values, err := envelopes.List(ctx, orgID, envelope.ListFilter{TeamID: teamID})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		titles := []string{}
		for _, v := range values {
			titles = append(titles, v.Title)
		}
		return titles
	}
	if titles := listed(sales); len(titles) != 1 || titles[0] != "Sales doc" {
		t.Fatalf("Sales list: %v", titles)
	}
	if titles := listed(general); len(titles) != 2 {
		t.Fatalf("General list should hold the General doc and the one with an unknown team: %v", titles)
	}
	_ = foreign

	// Opening an envelope checks its team, not the selected one.
	open := func(s identity.Session, id string) int {
		r := chi.NewRouter()
		r.With(access.envelopeAccess).Get("/envelopes/{envelopeID}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
		req := httptest.NewRequest(http.MethodGet, "/envelopes/"+id, nil).WithContext(identity.ContextWithSession(ctx, s))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := open(other, salesDoc.ID); code != http.StatusNotFound {
		t.Fatalf("other member opening a Sales envelope: %d", code)
	}
	if code := open(salesRep, salesDoc.ID); code != http.StatusOK {
		t.Fatalf("sales rep opening a Sales envelope from General: %d", code)
	}
	if code := open(owner, salesDoc.ID); code != http.StatusOK {
		t.Fatalf("owner opening a Sales envelope: %d", code)
	}
	if code := open(other, inGeneral.ID); code != http.StatusOK {
		t.Fatalf("other member opening a General envelope: %d", code)
	}

	// Bulk actions only touch the current team's envelopes.
	kept, err := access.inCurrentTeam(ctx, other, []string{inGeneral.ID, salesDoc.ID})
	if err != nil || len(kept) != 1 || kept[0] != inGeneral.ID {
		t.Fatalf("bulk filter: %v %v", kept, err)
	}

	// Folders belong to a team; the same name can exist in another team.
	folders := folder.NewService(folder.NewPostgresStore(pool))
	salesFolder, err := folders.Create(ctx, sales, salesRepID, folder.CreateInput{Name: "Contracts"})
	if err != nil {
		t.Fatalf("create Sales folder: %v", err)
	}
	if _, err := folders.Create(ctx, general, ownerID, folder.CreateInput{Name: "Contracts"}); err != nil {
		t.Fatalf("same folder name in General: %v", err)
	}
	if generalFolders, _ := folders.List(ctx, general); len(generalFolders) != 1 || generalFolders[0].ID == salesFolder.ID {
		t.Fatalf("General folders: %v", generalFolders)
	}
	// A General envelope can't be filed into a Sales folder.
	if _, err := envelopes.MoveToFolder(ctx, orgID, inGeneral.ID, envelope.MoveFolderInput{FolderID: &salesFolder.ID}); err == nil {
		t.Fatalf("moving a General envelope into a Sales folder should fail")
	}

	// Deleting: never the default team, never a team that still has envelopes.
	if code, _ := call(owner, http.MethodDelete, "/teams/"+general, ""); code != http.StatusConflict {
		t.Fatalf("delete default team: %d", code)
	}
	if code, _ := call(owner, http.MethodDelete, "/teams/"+sales, ""); code != http.StatusConflict {
		t.Fatalf("delete team with envelopes: %d", code)
	}
	if err := envelopes.Delete(ctx, orgID, salesDoc.ID); err != nil {
		t.Fatalf("delete Sales doc: %v", err)
	}
	if code, _ := call(inSales, http.MethodDelete, "/teams/"+sales, ""); code != http.StatusForbidden {
		t.Fatalf("team member deleting the team: %d", code)
	}
	if code, _ := call(owner, http.MethodDelete, "/teams/"+sales, ""); code != http.StatusNoContent {
		t.Fatalf("delete empty team: %d", code)
	}
}
