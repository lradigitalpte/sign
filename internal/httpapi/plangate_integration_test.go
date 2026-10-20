package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
	"signing-platform/internal/identity"
)

// Runs requests through planGate against a throwaway workspace: off by default, then with the
// plan-enforcement flag turned on for that workspace only.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/httpapi -run Integration
func TestIntegrationPlanGate(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	suffix := time.Now().Format("150405.000000")
	var ownerID, viewerID, orgID string
	for label, dest := range map[string]*string{"owner": &ownerID, "viewer": &viewerID} {
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, "gate-"+label+"-"+suffix+"@example.com", "Gate "+label).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Gate Co', $1) RETURNING id::text`, "gate-"+suffix).Scan(&orgID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM organizations WHERE id = $1::uuid`, orgID},
			{`DELETE FROM users WHERE id = $1::uuid`, ownerID},
			{`DELETE FROM users WHERE id = $1::uuid`, viewerID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup: %v", err)
			}
		}
	})
	if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner'), ($1::uuid, $3::uuid, 'viewer')`, orgID, ownerID, viewerID); err != nil {
		t.Fatal(err)
	}

	reached := false
	handler := planGate(pool)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		// The handler must still get the whole body.
		var body map[string]any
		if r.Header.Get("Content-Type") == "application/json" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("handler couldn't read the body: %v", err)
			}
		}
		w.WriteHeader(http.StatusOK)
	}))
	session := identity.Session{User: identity.User{ID: ownerID}, Workspace: identity.Workspace{ID: orgID, Role: "owner"}}
	call := func(method, path string, body any) (int, map[string]any) {
		t.Helper()
		var reader *bytes.Reader
		if body != nil {
			raw, _ := json.Marshal(body)
			reader = bytes.NewReader(raw)
		} else {
			reader = bytes.NewReader(nil)
		}
		request := httptest.NewRequest(method, path, reader).WithContext(identity.ContextWithSession(ctx, session))
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		reached = false
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		var payload map[string]any
		_ = json.Unmarshal(response.Body.Bytes(), &payload)
		return response.Code, payload
	}

	// Off (the default): everything goes through.
	if code, _ := call(http.MethodPost, "/v1/envelopes/bulk/delete", map[string]any{"ids": []string{}}); code != http.StatusOK || !reached {
		t.Fatalf("enforcement off: bulk delete = %d", code)
	}

	// On for this workspace only.
	if _, err := pool.Exec(ctx, `INSERT INTO feature_flag_overrides (flag_key, organization_id, enabled) VALUES ('plan-enforcement', $1::uuid, true)`, orgID); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		method string
		path   string
		body   any
		status int
		code   string
	}{
		{"bulk actions need Business", http.MethodPost, "/v1/envelopes/bulk/delete", map[string]any{"ids": []string{}}, http.StatusPaymentRequired, "plan_required"},
		{"teams need Business", http.MethodPost, "/v1/teams", map[string]any{"name": "Sales"}, http.StatusPaymentRequired, "plan_required"},
		{"signing links need Business", http.MethodPatch, "/v1/envelopes/abc", map[string]any{"distributionMethod": "link"}, http.StatusPaymentRequired, "plan_required"},
		{"plain envelope edits are fine", http.MethodPatch, "/v1/envelopes/abc", map[string]any{"title": "New title"}, http.StatusOK, ""},
		{"dropdown fields need Business", http.MethodPost, "/v1/envelopes/abc/fields", map[string]any{"type": "dropdown"}, http.StatusPaymentRequired, "plan_required"},
		{"signature fields are fine", http.MethodPost, "/v1/envelopes/abc/fields", map[string]any{"type": "signature"}, http.StatusOK, ""},
		{"own storage needs Enterprise", http.MethodPut, "/v1/workspace/storage", map[string]any{"provider": "s3"}, http.StatusPaymentRequired, "plan_required"},
		{"second sender needs a seat", http.MethodPost, "/v1/members/invite", map[string]any{"email": "x@example.com", "role": "member"}, http.StatusPaymentRequired, "seat_limit"},
		{"viewers are free", http.MethodPost, "/v1/members/invite", map[string]any{"email": "x@example.com", "role": "viewer"}, http.StatusOK, ""},
		{"promoting a viewer needs a seat", http.MethodPatch, "/v1/members/" + viewerID + "/role", map[string]any{"role": "member"}, http.StatusPaymentRequired, "seat_limit"},
		{"reading is never blocked", http.MethodGet, "/v1/teams", nil, http.StatusOK, ""},
		{"sending within the allowance", http.MethodPost, "/v1/envelopes/abc/send", nil, http.StatusOK, ""},
	}
	for _, tc := range cases {
		code, payload := call(tc.method, tc.path, tc.body)
		if code != tc.status || (tc.code != "" && payload["code"] != tc.code) {
			t.Errorf("%s: %d %v, want %d %s", tc.name, code, payload, tc.status, tc.code)
		}
		if tc.status == http.StatusOK && !reached {
			t.Errorf("%s: handler not reached", tc.name)
		}
	}

	// Free's monthly sends: three this month, so the fourth is blocked.
	for i := 0; i < 3; i++ {
		if _, err := pool.Exec(ctx, `INSERT INTO envelopes (organization_id, created_by, title, status, sent_at) VALUES ($1::uuid, $2::uuid, 'Sent', 'in_progress', now())`, orgID, ownerID); err != nil {
			t.Fatal(err)
		}
	}
	if code, payload := call(http.MethodPost, "/v1/envelopes/abc/send", nil); code != http.StatusPaymentRequired || payload["code"] != "send_limit" {
		t.Fatalf("fourth send = %d %v", code, payload)
	}

	// A paid plan lifts the limits it includes.
	if _, err := pool.Exec(ctx, `INSERT INTO organization_subscriptions (organization_id, plan, seats, status) VALUES ($1::uuid, 'business', 3, 'active')`, orgID); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/v1/envelopes/bulk/delete", "/v1/envelopes/abc/send"} {
		if code, payload := call(http.MethodPost, path, map[string]any{"ids": []string{}}); code != http.StatusOK {
			t.Errorf("business %s = %d %v", path, code, payload)
		}
	}
	if code, _ := call(http.MethodPost, "/v1/pdf-security/encrypt", map[string]any{}); code != http.StatusPaymentRequired {
		t.Errorf("business PDF vault = %d, want 402", code)
	}
}
