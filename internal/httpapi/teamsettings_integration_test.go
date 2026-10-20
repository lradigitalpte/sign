package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/database"
	"signing-platform/internal/envelope"
	"signing-platform/internal/identity"
)

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/httpapi -run Integration
func TestIntegrationTeamSettings(t *testing.T) {
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
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, name+"-settings-"+suffix+"@example.com", name).Scan(&id); err != nil {
			t.Fatalf("insert user: %v", err)
		}
		return id
	}
	ownerID, leadID, memberID := user("owner"), user("lead"), user("member")
	var orgID, salesID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Settings Test', $1) RETURNING id::text`, "settings-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, []string{ownerID, leadID, memberID})
	})
	for id, role := range map[string]string{ownerID: "owner", leadID: "member", memberID: "member"} {
		if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3)`, orgID, id, role); err != nil {
			t.Fatalf("membership: %v", err)
		}
	}
	if err := pool.QueryRow(ctx, `INSERT INTO teams (organization_id, name, slug) VALUES ($1::uuid, 'Sales', 'sales') RETURNING id::text`, orgID).Scan(&salesID); err != nil {
		t.Fatalf("insert team: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'admin'), ($1::uuid, $3::uuid, 'member')`, salesID, leadID, memberID); err != nil {
		t.Fatalf("team memberships: %v", err)
	}
	// The workspace's own settings.
	for section, config := range map[string]string{
		"preferences": `{"language":"fr","timezone":"Europe/Paris","firstReminderDays":4}`,
		"branding":    `{"brandName":"Acme","primaryColor":"#111111"}`,
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, $2, $3::jsonb)`, orgID, section, config); err != nil {
			t.Fatalf("org settings: %v", err)
		}
	}

	store := identity.NewPostgresStore(pool)
	session := func(userID, role, teamID string) identity.Session {
		team, err := store.ResolveTeam(ctx, userID, orgID, role, teamID)
		if err != nil {
			t.Fatalf("resolve team: %v", err)
		}
		return identity.Session{User: identity.User{ID: userID}, Workspace: identity.Workspace{ID: orgID, Role: role}, Team: team}
	}
	router := chi.NewRouter()
	router.Route("/team/settings/{section}", teamSettingsRoutes(pool))
	call := func(s identity.Session, method, path, body string) (int, teamSettingsView) {
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(identity.ContextWithSession(ctx, s))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		var view teamSettingsView
		_ = json.Unmarshal(rec.Body.Bytes(), &view)
		return rec.Code, view
	}
	settingsOf := func(raw json.RawMessage) map[string]any {
		out := map[string]any{}
		_ = json.Unmarshal(raw, &out)
		return out
	}

	lead := session(leadID, "member", salesID)
	member := session(memberID, "member", salesID)
	ownerGeneral := session(ownerID, "owner", "")

	// A team starts with the workspace's settings.
	code, view := call(lead, http.MethodGet, "/team/settings/preferences/", "")
	if code != http.StatusOK || view.Customized || !view.CanEdit || settingsOf(view.Effective)["language"] != "fr" {
		t.Fatalf("Sales before customizing: %d %+v", code, view)
	}
	// Only team admins (and workspace admins) customize; never the default team; only some sections.
	if code, _ := call(member, http.MethodPut, "/team/settings/preferences/", `{"overrides":{"language":"de"}}`); code != http.StatusForbidden {
		t.Fatalf("team member customizing: %d", code)
	}
	if code, _ := call(ownerGeneral, http.MethodPut, "/team/settings/preferences/", `{"overrides":{"language":"de"}}`); code != http.StatusConflict {
		t.Fatalf("customizing the default team: %d", code)
	}
	if code, _ := call(lead, http.MethodGet, "/team/settings/retention/", ""); code != http.StatusNotFound {
		t.Fatalf("retention per team: %d", code)
	}

	// The team admin overrides one key; the rest still comes from the workspace.
	code, view = call(lead, http.MethodPut, "/team/settings/preferences/", `{"overrides":{"language":"de","timezone":null}}`)
	effective := settingsOf(view.Effective)
	if code != http.StatusOK || !view.Customized || effective["language"] != "de" || effective["timezone"] != "Europe/Paris" || len(settingsOf(view.Overrides)) != 1 {
		t.Fatalf("after customizing: %d %+v", code, view)
	}

	// New envelopes take their team's settings.
	envelopes := envelope.NewService(envelope.NewPostgresStore(pool))
	inSales, err := envelopes.Create(ctx, orgID, leadID, envelope.CreateInput{Title: "Sales", TeamID: salesID})
	if err != nil {
		t.Fatalf("create in Sales: %v", err)
	}
	inGeneral, err := envelopes.Create(ctx, orgID, ownerID, envelope.CreateInput{Title: "General"})
	if err != nil {
		t.Fatalf("create in General: %v", err)
	}
	if inSales.Language != "de" || inSales.Timezone != "Europe/Paris" || inSales.FirstReminderDays != 4 || inGeneral.Language != "fr" {
		t.Fatalf("defaults: Sales %s/%s/%d, General %s", inSales.Language, inSales.Timezone, inSales.FirstReminderDays, inGeneral.Language)
	}

	// Branding for emails and signing pages follows the envelope's team.
	if code, _ := call(lead, http.MethodPut, "/team/settings/branding/", `{"overrides":{"brandName":"Acme Sales"}}`); code != http.StatusOK {
		t.Fatalf("customize branding: %d", code)
	}
	brand := func(envelopeID string) (string, string) {
		var name, color string
		if err := pool.QueryRow(ctx, `SELECT b.config->>'brandName', b.config->>'primaryColor' FROM envelopes e
LEFT JOIN LATERAL (SELECT effective_settings(e.organization_id, e.team_id, 'branding') AS config) b ON true WHERE e.id = $1::uuid`, envelopeID).Scan(&name, &color); err != nil {
			t.Fatalf("branding: %v", err)
		}
		return name, color
	}
	if name, color := brand(inSales.ID); name != "Acme Sales" || color != "#111111" {
		t.Fatalf("Sales branding: %q %q", name, color)
	}
	if name, _ := brand(inGeneral.ID); name != "Acme" {
		t.Fatalf("General branding: %q", name)
	}

	// Going back to the workspace's settings.
	code, view = call(lead, http.MethodPut, "/team/settings/preferences/", `{"overrides":null}`)
	if code != http.StatusOK || view.Customized || settingsOf(view.Effective)["language"] != "fr" {
		t.Fatalf("after resetting: %d %+v", code, view)
	}
	again, err := envelopes.Create(ctx, orgID, leadID, envelope.CreateInput{Title: "Sales again", TeamID: salesID})
	if err != nil || again.Language != "fr" {
		t.Fatalf("after resetting, new Sales envelope: %v %v", again.Language, err)
	}
}
