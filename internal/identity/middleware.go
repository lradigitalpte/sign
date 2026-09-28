package identity

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	platformauth "signing-platform/internal/auth"
)

func Middleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, ok := platformauth.IdentityFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			session, err := service.Sync(r.Context(), identity.Subject, identity.OrganizationID, identity.Role)
			if err != nil {
				http.Error(w, "unable to load workspace", http.StatusBadGateway)
				return
			}
			if requested := strings.TrimSpace(r.Header.Get(WorkspaceHeader)); requested != "" && requested != session.Workspace.ID {
				session, err = service.SelectWorkspace(r.Context(), session, requested)
				if errors.Is(err, ErrWorkspaceNotFound) {
					// The web app clears its stored workspace when it sees this code.
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error(), "code": "workspace_forbidden"})
					return
				}
				if err != nil {
					http.Error(w, "unable to load workspace", http.StatusBadGateway)
					return
				}
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, session)))
		})
	}
}
