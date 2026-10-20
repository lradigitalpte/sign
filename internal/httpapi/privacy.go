package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/announcements"
	"signing-platform/internal/billing"
	"signing-platform/internal/identity"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/members"
	"signing-platform/internal/supportaccess"
)

func requireOwner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		if session.Workspace.Role != "owner" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "only the workspace owner can do this"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requireWorkspaceManager(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		if !members.IsManager(session.Workspace.Role) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "only workspace owners and admins can do this"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

var fileSafe = regexp.MustCompile(`[^a-z0-9-]+`)

// privacyRoutes: announcements, Signet support access, workspace export and deletion.
func privacyRoutes(db *pgxpool.Pool, lifecycleService *lifecycle.Service) func(chi.Router) {
	return func(r chi.Router) {
		r.Get("/announcements", func(w http.ResponseWriter, request *http.Request) {
			session, _ := identity.SessionFromContext(request.Context())
			list, err := announcements.ForWorkspace(request.Context(), db, session.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load announcements"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": list})
		})

		// What the workspace's plan allows, so the web app can explain limits before anyone hits them.
		r.Get("/workspace/entitlements", func(w http.ResponseWriter, request *http.Request) {
			session, _ := identity.SessionFromContext(request.Context())
			entitlements, err := billing.LoadEntitlements(request.Context(), db, session.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load your plan"})
				return
			}
			writeJSON(w, http.StatusOK, entitlements)
		})

		r.Route("/workspace/support-access", func(r chi.Router) {
			r.Use(requireWorkspaceManager)
			r.Get("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				current, err := supportaccess.Current(request.Context(), db, session.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load support access"})
					return
				}
				history, err := supportaccess.History(request.Context(), db, session.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load support access"})
					return
				}
				writeJSON(w, http.StatusOK, map[string]any{"current": current, "history": history})
			})
			r.Post("/", func(w http.ResponseWriter, request *http.Request) {
				var input struct {
					Hours int    `json:"hours"`
					Note  string `json:"note"`
				}
				if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 16<<10)).Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				session, _ := identity.SessionFromContext(request.Context())
				grant, err := supportaccess.Allow(request.Context(), db, session.Workspace.ID, session.User.ID, input.Hours, input.Note)
				if errors.Is(err, supportaccess.ErrDuration) {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to turn on support access"})
					return
				}
				writeJSON(w, http.StatusOK, grant)
			})
			r.Delete("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				err := supportaccess.Revoke(request.Context(), db, session.Workspace.ID, session.User.ID)
				if errors.Is(err, supportaccess.ErrNoGrant) {
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to turn off support access"})
					return
				}
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			})
		})

		// Everything in the workspace as a zip. Owners only: it contains every document.
		r.With(requireOwner).Get("/workspace/export", func(w http.ResponseWriter, request *http.Request) {
			session, _ := identity.SessionFromContext(request.Context())
			name := strings.Trim(fileSafe.ReplaceAllString(strings.ToLower(session.Workspace.Name), "-"), "-")
			if name == "" {
				name = "workspace"
			}
			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="signet-%s-%s.zip"`, name, time.Now().UTC().Format("2006-01-02")))
			w.Header().Set("Cache-Control", "no-store")
			// Big workspaces take longer than the server's normal write timeout to stream.
			_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(30 * time.Minute))
			// Once streaming starts the status is sent, so a failure can only cut the download short.
			if err := lifecycleService.WriteExport(request.Context(), session.Workspace.ID, w); err != nil {
				slog.ErrorContext(request.Context(), "workspace export", "workspaceId", session.Workspace.ID, "error", err)
			}
		})

		// A person deleting their own account. Anyone can, for themselves; see lifecycle for what it does.
		r.Route("/me/deletion", func(r chi.Router) {
			r.Get("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				pending, err := lifecycle.PendingAccountDeletion(request.Context(), db, session.User.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load deletion status"})
					return
				}
				writeJSON(w, http.StatusOK, map[string]any{"request": pending, "graceDays": int(lifecycle.DeletionGrace.Hours() / 24)})
			})
			r.Post("/", func(w http.ResponseWriter, request *http.Request) {
				var input struct {
					ConfirmEmail string `json:"confirmEmail"`
				}
				if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 16<<10)).Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				session, _ := identity.SessionFromContext(request.Context())
				if !strings.EqualFold(strings.TrimSpace(input.ConfirmEmail), session.User.Email) {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "type your email address exactly to confirm"})
					return
				}
				pending, err := lifecycleService.RequestAccountDeletion(request.Context(), session.User.ID, session.User.Email)
				var shared *lifecycle.SharedWorkspacesError
				switch {
				case errors.As(err, &shared), errors.Is(err, lifecycle.ErrLegalHold), errors.Is(err, lifecycle.ErrAccountScheduled), errors.Is(err, lifecycle.ErrPlatformAdmin):
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				case err != nil:
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to schedule deletion"})
				default:
					writeJSON(w, http.StatusOK, pending)
				}
			})
			r.Delete("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				pending, err := lifecycle.PendingAccountDeletion(request.Context(), db, session.User.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to cancel deletion"})
					return
				}
				if pending == nil {
					writeJSON(w, http.StatusConflict, map[string]string{"error": lifecycle.ErrNoAccountRequest.Error()})
					return
				}
				canceled, err := lifecycle.CancelAccountDeletion(request.Context(), db, pending.ID, session.User.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to cancel deletion"})
					return
				}
				writeJSON(w, http.StatusOK, canceled)
			})
		})

		r.Route("/workspace/deletion", func(r chi.Router) {
			// Every member sees a scheduled deletion, so nobody is surprised.
			r.Get("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				pending, err := lifecycle.PendingDeletion(request.Context(), db, session.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load deletion status"})
					return
				}
				hold, err := lifecycle.LegalHold(request.Context(), db, session.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load deletion status"})
					return
				}
				writeJSON(w, http.StatusOK, map[string]any{"request": pending, "legalHold": hold, "graceDays": int(lifecycle.DeletionGrace.Hours() / 24)})
			})
			r.With(requireOwner).Post("/", func(w http.ResponseWriter, request *http.Request) {
				var input struct {
					ConfirmName string `json:"confirmName"`
				}
				if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 16<<10)).Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				session, _ := identity.SessionFromContext(request.Context())
				if strings.TrimSpace(input.ConfirmName) != strings.TrimSpace(session.Workspace.Name) {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "type the workspace name exactly to confirm"})
					return
				}
				pending, err := lifecycleService.RequestDeletion(request.Context(), session.Workspace.ID, session.User.ID, session.User.Email)
				if errors.Is(err, lifecycle.ErrLegalHold) || errors.Is(err, lifecycle.ErrAlreadyScheduled) {
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to schedule deletion"})
					return
				}
				writeJSON(w, http.StatusOK, pending)
			})
			r.With(requireOwner).Delete("/", func(w http.ResponseWriter, request *http.Request) {
				session, _ := identity.SessionFromContext(request.Context())
				pending, err := lifecycle.PendingDeletion(request.Context(), db, session.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to cancel deletion"})
					return
				}
				if pending == nil {
					writeJSON(w, http.StatusConflict, map[string]string{"error": lifecycle.ErrNoRequest.Error()})
					return
				}
				canceled, err := lifecycle.CancelDeletion(request.Context(), db, pending.ID, session.User.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to cancel deletion"})
					return
				}
				writeJSON(w, http.StatusOK, canceled)
			})
		})
	}
}

// validateRetention checks the retention settings section. It returns a message for the customer, or "".
func validateRetention(config map[string]any) string {
	for _, key := range []string{"autoDelete", "legalHold"} {
		if value, ok := config[key]; ok {
			if _, isBool := value.(bool); !isBool {
				return key + " must be true or false"
			}
		}
	}
	if config["autoDelete"] == true {
		months, ok := config["retentionMonths"].(float64)
		if !ok || months != float64(int(months)) || int(months) < lifecycle.MinRetentionMonths || int(months) > lifecycle.MaxRetentionMonths {
			return fmt.Sprintf("choose a retention period between %d and %d months", lifecycle.MinRetentionMonths, lifecycle.MaxRetentionMonths)
		}
	}
	return ""
}
