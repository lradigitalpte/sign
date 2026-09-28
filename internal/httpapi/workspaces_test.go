package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"signing-platform/internal/identity"
)

func TestReadOnlyForViewers(t *testing.T) {
	cases := []struct {
		role, method, path string
		want               int
	}{
		{"viewer", http.MethodGet, "/v1/envelopes", http.StatusOK},
		{"viewer", http.MethodPost, "/v1/envelopes", http.StatusForbidden},
		{"viewer", http.MethodDelete, "/v1/envelopes/123", http.StatusForbidden},
		{"viewer", http.MethodPatch, "/v1/members/123/role", http.StatusForbidden},
		{"viewer", http.MethodPatch, "/v1/me", http.StatusOK},
		{"viewer", http.MethodPut, "/v1/me/signature-preferences", http.StatusOK},
		{"viewer", http.MethodPost, "/v1/inbox/abc/access", http.StatusOK},
		{"viewer", http.MethodPost, "/v1/invitations/tok/accept", http.StatusOK},
		{"viewer", http.MethodPost, "/v1/workspaces", http.StatusOK},
		{"viewer", http.MethodPost, "/v1/pdf-security/encrypt", http.StatusForbidden},
		{"member", http.MethodPost, "/v1/envelopes", http.StatusOK},
		{"admin", http.MethodDelete, "/v1/envelopes/123", http.StatusOK},
	}
	handler := readOnlyForViewers(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	for _, tc := range cases {
		request := httptest.NewRequest(tc.method, tc.path, nil)
		request = request.WithContext(identity.ContextWithSession(request.Context(), identity.Session{Workspace: identity.Workspace{Role: tc.role}}))
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != tc.want {
			t.Errorf("%s %s as %s: got %d, want %d", tc.method, tc.path, tc.role, recorder.Code, tc.want)
		}
	}
}

func TestRequireManager(t *testing.T) {
	handler := requireManager(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	for role, want := range map[string]int{"owner": 200, "admin": 200, "member": 403, "viewer": 403} {
		request := httptest.NewRequest(http.MethodPost, "/v1/members/invite", nil)
		request = request.WithContext(identity.ContextWithSession(request.Context(), identity.Session{Workspace: identity.Workspace{Role: role}}))
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != want {
			t.Errorf("%s: got %d, want %d", role, recorder.Code, want)
		}
	}
}
