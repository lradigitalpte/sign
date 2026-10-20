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
					writeCode(w, "workspace_forbidden", err.Error())
					return
				}
				if err != nil {
					http.Error(w, "unable to load workspace", http.StatusBadGateway)
					return
				}
			}
			session, err = service.SelectTeam(r.Context(), session, strings.TrimSpace(r.Header.Get(TeamHeader)))
			if errors.Is(err, ErrTeamNotFound) {
				// The web app clears its stored team when it sees this code.
				writeCode(w, "team_forbidden", err.Error())
				return
			}
			if err != nil {
				http.Error(w, "unable to load team", http.StatusBadGateway)
				return
			}
			suspension, err := service.Suspension(r.Context(), session)
			if err != nil {
				http.Error(w, "unable to load workspace", http.StatusBadGateway)
				return
			}
			if suspension.User {
				writeCode(w, CodeAccountSuspended, "this account has been suspended")
				return
			}
			session.Workspace.Suspended = suspension.Workspace
			if suspension.Workspace && !allowedInSuspendedWorkspace(r) {
				writeCode(w, CodeWorkspaceSuspended, "this workspace has been suspended")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, session)))
		})
	}
}

func writeCode(w http.ResponseWriter, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message, "code": code})
}
