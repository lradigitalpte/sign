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
	"signing-platform/internal/identity"
)

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/httpapi -run Integration
func TestIntegrationGroupsGiveTeamAccess(t *testing.T) {
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
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, name+"-groups-"+suffix+"@example.com", name).Scan(&id); err != nil {
			t.Fatalf("insert user: %v", err)
		}
		return id
	}
	ownerID, aliceID, bobID := user("owner"), user("alice"), user("bob")
	org := func(name string) string {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id::text`, name, strings.ToLower(name)+"-"+suffix).Scan(&id); err != nil {
			t.Fatalf("insert org: %v", err)
		}
		return id
	}
	orgID, otherOrgID := org("Groups"), org("Elsewhere")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = ANY($1::uuid[])`, []string{orgID, otherOrgID})
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, []string{ownerID, aliceID, bobID})
	})
	for id, role := range map[string]string{ownerID: "owner", aliceID: "member", bobID: "member"} {
		if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3)`, orgID, id, role); err != nil {
			t.Fatalf("membership: %v", err)
		}
	}
	var legalID, foreignGroupID string
	if err := pool.QueryRow(ctx, `INSERT INTO teams (organization_id, name, slug) VALUES ($1::uuid, 'Legal', 'legal') RETURNING id::text`, orgID).Scan(&legalID); err != nil {
		t.Fatalf("team: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO member_groups (organization_id, name) VALUES ($1::uuid, 'Outsiders') RETURNING id::text`, otherOrgID).Scan(&foreignGroupID); err != nil {
		t.Fatalf("foreign group: %v", err)
	}

	store := identity.NewPostgresStore(pool)
	owner := identity.Session{User: identity.User{ID: ownerID}, Workspace: identity.Workspace{ID: orgID, Role: "owner"}}
	asMember := func(id string) identity.Session {
		return identity.Session{User: identity.User{ID: id}, Workspace: identity.Workspace{ID: orgID, Role: "member"}}
	}
	access := &teamAccess{db: pool}
	router := chi.NewRouter()
	router.Route("/groups", groupRoutes(pool))
	router.Route("/teams", access.routes)
	call := func(s identity.Session, method, path, body string) (int, map[string]any) {
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(identity.ContextWithSession(ctx, s))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		out := map[string]any{}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}
	canUseLegal := func(userID string) (string, bool) {
		team, err := store.ResolveTeam(ctx, userID, orgID, "member", legalID)
		if errors.Is(err, identity.ErrTeamNotFound) {
			return "", false
		}
		if err != nil {
			t.Fatalf("resolve: %v", err)
		}
		return team.Role, true
	}

	// Only workspace admins manage groups.
	if code, _ := call(asMember(aliceID), http.MethodPost, "/groups/", `{"name":"Lawyers"}`); code != http.StatusForbidden {
		t.Fatalf("member creating a group: %d", code)
	}
	code, created := call(owner, http.MethodPost, "/groups/", `{"name":"Lawyers","description":"Everyone in legal"}`)
	if code != http.StatusCreated {
		t.Fatalf("create group: %d %v", code, created)
	}
	lawyers := created["id"].(string)
	if code, _ := call(owner, http.MethodPut, "/groups/"+lawyers+"/members/"+aliceID, ""); code != http.StatusOK {
		t.Fatalf("add alice: %d", code)
	}
	if code, _ := call(owner, http.MethodPut, "/groups/"+lawyers+"/members/00000000-0000-0000-0000-000000000000", ""); code != http.StatusNotFound {
		t.Fatalf("adding a stranger: %d", code)
	}

	// Being in a group alone gives nothing until the group is attached to a team.
	if _, ok := canUseLegal(aliceID); ok {
		t.Fatalf("alice could use Legal before the group was attached")
	}
	if code, _ := call(owner, http.MethodPut, "/teams/"+legalID+"/groups/"+foreignGroupID, `{"role":"member"}`); code != http.StatusNotFound {
		t.Fatalf("attaching another workspace's group: %d", code)
	}
	if code, _ := call(owner, http.MethodPut, "/teams/"+legalID+"/groups/"+lawyers, `{"role":"member"}`); code != http.StatusOK {
		t.Fatalf("attach group: %d", code)
	}
	if role, ok := canUseLegal(aliceID); !ok || role != "member" {
		t.Fatalf("alice through the group: %q %v", role, ok)
	}
	if _, ok := canUseLegal(bobID); ok {
		t.Fatalf("bob isn't in the group but could use Legal")
	}

	// The highest role wins: a direct member who's also in an admin group is a team admin.
	if _, err := pool.Exec(ctx, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'member')`, legalID, bobID); err != nil {
		t.Fatalf("bob direct: %v", err)
	}
	if code, _ := call(owner, http.MethodPut, "/groups/"+lawyers+"/members/"+bobID, ""); code != http.StatusOK {
		t.Fatalf("add bob: %d", code)
	}
	if code, _ := call(owner, http.MethodPut, "/teams/"+legalID+"/groups/"+lawyers, `{"role":"admin"}`); code != http.StatusOK {
		t.Fatalf("make group admin: %d", code)
	}
	if role, _ := canUseLegal(bobID); role != "admin" {
		t.Fatalf("bob's role: %q", role)
	}
	// A team admin through a group can manage the team.
	code, team := call(asMember(aliceID), http.MethodGet, "/teams/"+legalID, "")
	if code != http.StatusOK || team["canManage"] != true || team["memberCount"].(float64) != 2 {
		t.Fatalf("Legal for alice: %d %v", code, team)
	}

	// The group list shows which teams each group opens.
	_, list := call(asMember(bobID), http.MethodGet, "/groups/", "")
	groups := list["data"].([]any)
	if len(groups) != 1 || list["canManage"] != false {
		t.Fatalf("group list: %v", list)
	}
	if teams := groups[0].(map[string]any)["teams"].([]any); len(teams) != 1 || teams[0].(map[string]any)["role"] != "admin" {
		t.Fatalf("group's teams: %v", teams)
	}

	// Leaving the workspace removes group memberships (and with them, team access).
	if _, err := pool.Exec(ctx, `DELETE FROM organization_memberships WHERE organization_id = $1::uuid AND user_id = $2::uuid`, orgID, aliceID); err != nil {
		t.Fatalf("remove alice: %v", err)
	}
	var stillInGroup bool
	_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM member_group_members WHERE user_id = $1::uuid)`, aliceID).Scan(&stillInGroup)
	if stillInGroup {
		t.Fatalf("alice is still in the group after leaving the workspace")
	}

	// Deleting the group takes away the access it gave; bob keeps his direct membership as a member.
	if code, _ := call(owner, http.MethodDelete, "/groups/"+lawyers, ""); code != http.StatusNoContent {
		t.Fatalf("delete group: %d", code)
	}
	if role, ok := canUseLegal(bobID); !ok || role != "member" {
		t.Fatalf("bob after the group was deleted: %q %v", role, ok)
	}
}
