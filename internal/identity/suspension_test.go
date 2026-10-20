package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	platformauth "signing-platform/internal/auth"
)

type acceptAnyToken struct{}

func (acceptAnyToken) Verify(context.Context, string) (platformauth.Identity, error) {
	return platformauth.Identity{Subject: "user_123"}, nil
}

// suspendedStore is a fakeStore that also reports suspension, like PostgresStore.
type suspendedStore struct {
	fakeStore
	suspension Suspension
}

func (s *suspendedStore) Suspension(context.Context, string, string) (Suspension, error) {
	return s.suspension, nil
}

func TestMiddlewareBlocksSuspendedAccountsAndWorkspaces(t *testing.T) {
	cases := []struct {
		name       string
		suspension Suspension
		method     string
		path       string
		wantStatus int
		wantCode   string
	}{
		{"active", Suspension{}, http.MethodGet, "/v1/envelopes", http.StatusOK, ""},
		{"suspended user is blocked everywhere", Suspension{User: true}, http.MethodGet, "/v1/me", http.StatusForbidden, CodeAccountSuspended},
		{"suspended workspace blocks work", Suspension{Workspace: true}, http.MethodGet, "/v1/envelopes", http.StatusForbidden, CodeWorkspaceSuspended},
		{"suspended workspace blocks writes to the workspace list", Suspension{Workspace: true}, http.MethodPost, "/v1/workspaces", http.StatusForbidden, CodeWorkspaceSuspended},
		{"suspended workspace still loads the profile", Suspension{Workspace: true}, http.MethodGet, "/v1/me", http.StatusOK, ""},
		{"suspended workspace still lists workspaces", Suspension{Workspace: true}, http.MethodGet, "/v1/workspaces", http.StatusOK, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := &suspendedStore{suspension: tc.suspension}
			service := NewService(fakeDirectory{user: ProviderUser{Subject: "user_123", Email: "person@example.com", Name: "Person"}}, store)
			var seen Session
			handler := platformauth.Middleware(acceptAnyToken{})(Middleware(service)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen, _ = SessionFromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})))

			request := httptest.NewRequest(tc.method, tc.path, nil)
			request.Header.Set("Authorization", "Bearer token")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d (%s)", response.Code, tc.wantStatus, response.Body.String())
			}
			if tc.wantCode != "" {
				var body map[string]string
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body["code"] != tc.wantCode {
					t.Fatalf("body = %s, want code %s", response.Body.String(), tc.wantCode)
				}
			}
			if response.Code == http.StatusOK && seen.Workspace.Suspended != tc.suspension.Workspace {
				t.Fatalf("session workspace suspended = %v, want %v", seen.Workspace.Suspended, tc.suspension.Workspace)
			}
		})
	}
}
