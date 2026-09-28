package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/identity"
	"signing-platform/internal/members"
)

// publicInvitationRoutes lets someone who opened an invitation link see what they were invited to
// before signing in or creating an account.
func invitationPreviewHandler(service *members.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		preview, err := service.PreviewInvitation(r.Context(), chi.URLParam(r, "token"))
		if errors.Is(err, members.ErrInvitationNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load invitation"})
			return
		}
		writeJSON(w, http.StatusOK, preview)
	}
}

func acceptInvitationHandler(service *members.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		org, err := service.AcceptInvitation(r.Context(), chi.URLParam(r, "token"), session.User.ID, session.User.Email)
		switch {
		case errors.Is(err, members.ErrInvitationNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		case errors.Is(err, members.ErrInvitationInactive):
			writeJSON(w, http.StatusGone, map[string]string{"error": err.Error()})
		case errors.Is(err, members.ErrInvitationEmail):
			writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error() + " (signed in as " + session.User.Email + ")"})
		case err != nil:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to accept invitation"})
		default:
			writeJSON(w, http.StatusOK, map[string]any{"workspace": org})
		}
	}
}

func workspaceRoutes(users *identity.Service, service *members.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := users.ListWorkspaces(r.Context(), session.User.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list workspaces"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			org, err := service.CreateOrganization(r.Context(), session.User.ID, input.Name)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, org)
		})
	}
}

// viewerWritable lists the writes a viewer may still make: their own profile and signature,
// documents sent to them personally, PDF verification, and joining or creating workspaces.
// Each entry matches the path itself and anything below it.
var viewerWritable = []struct{ method, path string }{
	{http.MethodPatch, "/v1/me"},
	{http.MethodPut, "/v1/me/signature-preferences"},
	{http.MethodPost, "/v1/inbox"},
	{http.MethodPost, "/v1/pdf-security/verify"},
	{http.MethodPost, "/v1/workspaces"},
	{http.MethodPost, "/v1/invitations"},
}

// readOnlyForViewers rejects workspace changes by members with the viewer role.
func readOnlyForViewers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		if session.Workspace.Role != "viewer" || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		path := strings.TrimRight(r.URL.Path, "/")
		for _, allowed := range viewerWritable {
			if r.Method == allowed.method && (path == allowed.path || strings.HasPrefix(path, allowed.path+"/")) {
				next.ServeHTTP(w, r)
				return
			}
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "viewers have read-only access to this workspace", "code": "viewer_read_only"})
	})
}
