package admin

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	platformauth "signing-platform/internal/auth"
	"signing-platform/internal/billing"
)

type contextKey struct{}

// FromContext returns the admin resolved by Middleware.
func FromContext(ctx context.Context) (Admin, bool) {
	a, ok := ctx.Value(contextKey{}).(Admin)
	return a, ok
}

// Middleware requires a verified WorkOS identity (platformauth.Middleware must run first) that belongs to a platform admin.
func Middleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, ok := platformauth.IdentityFromContext(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthorized", "unauthorized")
				return
			}
			a, err := service.ResolveSubject(r.Context(), identity.Subject)
			if errors.Is(err, ErrNotAdmin) {
				writeError(w, http.StatusForbidden, "not_admin", "this account doesn't have admin access")
				return
			}
			if err != nil {
				slog.Error("resolve platform admin", "error", err)
				writeError(w, http.StatusInternalServerError, "internal", "unable to verify admin access")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, a)))
		})
	}
}

// Require rejects admins whose role is below minimum.
func Require(minimum Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			a, ok := FromContext(r.Context())
			if !ok || !a.Role.Allows(minimum) {
				writeError(w, http.StatusForbidden, "insufficient_role", "your admin role can't do this")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Routes mounts under /admin/v1, inside platformauth.Middleware and Middleware.
func Routes(service *Service) func(chi.Router) {
	return func(r chi.Router) {
		r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
			a, _ := FromContext(r.Context())
			writeJSON(w, http.StatusOK, a)
		})
		r.Get("/stats", func(w http.ResponseWriter, r *http.Request) {
			days, _ := strconv.Atoi(r.URL.Query().Get("days"))
			stats, err := service.Stats(r.Context(), days)
			respond(w, stats, err)
		})
		r.Get("/system", func(w http.ResponseWriter, r *http.Request) {
			health, err := service.SystemHealth(r.Context())
			respond(w, health, err)
		})
		r.Get("/workspaces", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			list, err := service.ListWorkspaces(r.Context(), q.Get("query"), statusFilter(q.Get("status")), q.Get("plan"), pageFrom(r))
			respond(w, list, err)
		})
		r.Get("/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
			detail, err := service.GetWorkspace(r.Context(), chi.URLParam(r, "id"))
			respond(w, detail, err)
		})
		r.Get("/users", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			list, err := service.ListUsers(r.Context(), q.Get("query"), statusFilter(q.Get("status")), pageFrom(r))
			respond(w, list, err)
		})
		r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
			detail, err := service.GetUser(r.Context(), chi.URLParam(r, "id"))
			respond(w, detail, err)
		})
		r.Get("/admins", func(w http.ResponseWriter, r *http.Request) {
			admins, err := service.List(r.Context())
			respond(w, admins, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/admins", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Email  string `json:"email"`
				Role   Role   `json:"role"`
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			a, err := service.GrantFromApp(r.Context(), actorFrom(r), input.Email, input.Role, input.Reason)
			respond(w, a, err)
		})
		r.With(Require(RoleSuperAdmin)).Delete("/admins/{userId}", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			err := service.RevokeFromApp(r.Context(), actorFrom(r), chi.URLParam(r, "userId"), input.Reason)
			respond(w, ok, err)
		})
		r.Get("/audit", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			filter := AuditFilter{Query: q.Get("query"), AdminID: q.Get("adminId"), TargetType: q.Get("targetType"), TargetID: q.Get("targetId")}
			list, err := service.ListAudit(r.Context(), filter, pageFrom(r))
			respond(w, list, err)
		})

		// Workspace and user management. Suspension and membership changes need super_admin;
		// resending an invitation only re-sends what the customer already set up, so support can do it.
		suspension := func(action func(context.Context, Actor, string, string) (SuspensionResult, error)) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) {
				var input reasonBody
				if !decode(w, r, &input) {
					return
				}
				result, err := action(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
				respond(w, result, err)
			}
		}
		r.With(Require(RoleSuperAdmin)).Post("/workspaces/{id}/suspend", suspension(service.SuspendWorkspace))
		r.With(Require(RoleSuperAdmin)).Post("/workspaces/{id}/unsuspend", suspension(service.UnsuspendWorkspace))
		r.With(Require(RoleSuperAdmin)).Post("/users/{id}/suspend", suspension(service.SuspendUser))
		r.With(Require(RoleSuperAdmin)).Post("/users/{id}/unsuspend", suspension(service.UnsuspendUser))
		r.With(Require(RoleSuperAdmin)).Patch("/workspaces/{id}/members/{userId}", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Role   string `json:"role"`
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			err := service.ChangeMemberRole(r.Context(), actorFrom(r), chi.URLParam(r, "id"), chi.URLParam(r, "userId"), input.Role, input.Reason)
			respond(w, ok, err)
		})
		r.With(Require(RoleSuperAdmin)).Delete("/workspaces/{id}/members/{userId}", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			err := service.RemoveMember(r.Context(), actorFrom(r), chi.URLParam(r, "id"), chi.URLParam(r, "userId"), input.Reason)
			respond(w, ok, err)
		})
		// Plans, usage and feature flags.
		r.Get("/billing", func(w http.ResponseWriter, r *http.Request) {
			overview, err := service.BillingOverview(r.Context())
			respond(w, overview, err)
		})
		r.Get("/plans", func(w http.ResponseWriter, r *http.Request) {
			prices, err := billing.Prices(r.Context(), service.db)
			respond(w, prices, err)
		})
		r.With(Require(RoleSuperAdmin)).Put("/plans/{plan}/price", func(w http.ResponseWriter, r *http.Request) {
			var input PlanPriceInput
			if !decode(w, r, &input) {
				return
			}
			price, err := service.SetPlanPrice(r.Context(), actorFrom(r), chi.URLParam(r, "plan"), input)
			respond(w, price, err)
		})
		r.Get("/workspaces/{id}/usage", func(w http.ResponseWriter, r *http.Request) {
			usage, err := service.GetWorkspaceUsage(r.Context(), chi.URLParam(r, "id"))
			respond(w, usage, err)
		})
		r.Get("/workspaces/{id}/flags", func(w http.ResponseWriter, r *http.Request) {
			flags, err := service.WorkspaceFlags(r.Context(), chi.URLParam(r, "id"))
			respond(w, flags, err)
		})
		r.With(Require(RoleSuperAdmin)).Put("/workspaces/{id}/subscription", func(w http.ResponseWriter, r *http.Request) {
			var input SubscriptionInput
			if !decode(w, r, &input) {
				return
			}
			sub, err := service.SetSubscription(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input)
			respond(w, sub, err)
		})
		r.Get("/flags", func(w http.ResponseWriter, r *http.Request) {
			flags, err := service.ListFlags(r.Context())
			respond(w, flags, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/flags", func(w http.ResponseWriter, r *http.Request) {
			var input FlagInput
			if !decode(w, r, &input) {
				return
			}
			respond(w, ok, service.CreateFlag(r.Context(), actorFrom(r), input))
		})
		r.With(Require(RoleSuperAdmin)).Patch("/flags/{key}", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Enabled bool   `json:"enabled"`
				Reason  string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			respond(w, ok, service.SetFlagDefault(r.Context(), actorFrom(r), chi.URLParam(r, "key"), input.Enabled, input.Reason))
		})
		r.With(Require(RoleSuperAdmin)).Put("/flags/{key}/overrides/{workspaceId}", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Enabled *bool  `json:"enabled"` // null removes the override
				Reason  string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			respond(w, ok, service.SetFlagOverride(r.Context(), actorFrom(r), chi.URLParam(r, "key"), chi.URLParam(r, "workspaceId"), input.Enabled, input.Reason))
		})
		r.With(Require(RoleSuperAdmin)).Delete("/flags/{key}", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			respond(w, ok, service.DeleteFlag(r.Context(), actorFrom(r), chi.URLParam(r, "key"), input.Reason))
		})

		// WorkOS webhook events.
		r.Get("/webhooks", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			list, err := service.ListWebhookEvents(r.Context(), q.Get("query"), q.Get("status"), pageFrom(r))
			respond(w, list, err)
		})
		r.Get("/webhooks/{id}", func(w http.ResponseWriter, r *http.Request) {
			event, err := service.GetWebhookEvent(r.Context(), chi.URLParam(r, "id"))
			respond(w, event, err)
		})
		r.With(Require(RoleSupport)).Post("/webhooks/{id}/reprocess", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			event, err := service.ReprocessWebhookEvent(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, event, err)
		})

		// Documents, only while the workspace has support access on. Support and up.
		r.With(Require(RoleSupport)).Get("/envelopes/{id}/documents/{documentId}/file", func(w http.ResponseWriter, r *http.Request) {
			stored, body, err := service.OpenDocument(r.Context(), actorFrom(r), chi.URLParam(r, "id"), chi.URLParam(r, "documentId"), r.URL.Query().Get("version") == "signed")
			if err != nil {
				respond(w, nil, err)
				return
			}
			defer body.Close()
			w.Header().Set("Content-Type", "application/pdf")
			w.Header().Set("Content-Disposition", `inline; filename="`+strings.ReplaceAll(stored.Filename, `"`, "")+`"`)
			w.Header().Set("Cache-Control", "no-store")
			_, _ = io.Copy(w, body)
		})

		r.With(Require(RoleSuperAdmin)).Patch("/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Name   string `json:"name"`
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			result, err := service.RenameWorkspace(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Name, input.Reason)
			respond(w, result, err)
		})

		// Account deletions (people deleting their own accounts).
		r.Get("/account-deletions", func(w http.ResponseWriter, r *http.Request) {
			list, err := service.ListAccountDeletions(r.Context(), r.URL.Query().Get("status"), pageFrom(r))
			respond(w, list, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/account-deletions/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			result, err := service.CancelAccountDeletion(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, result, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/account-deletions/{id}/run", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			result, err := service.RunAccountDeletionNow(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, result, err)
		})

		// Workspace deletions.
		r.Get("/deletions", func(w http.ResponseWriter, r *http.Request) {
			list, err := service.ListDeletions(r.Context(), r.URL.Query().Get("status"), pageFrom(r))
			respond(w, list, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/deletions/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			result, err := service.CancelDeletion(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, result, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/deletions/{id}/run", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			result, err := service.RunDeletionNow(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, result, err)
		})

		// Announcements.
		r.Get("/announcements", func(w http.ResponseWriter, r *http.Request) {
			list, err := service.ListAnnouncements(r.Context())
			respond(w, list, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/announcements", func(w http.ResponseWriter, r *http.Request) {
			var input AnnouncementInput
			if !decode(w, r, &input) {
				return
			}
			a, err := service.SaveAnnouncement(r.Context(), actorFrom(r), "", input)
			respond(w, a, err)
		})
		r.With(Require(RoleSuperAdmin)).Put("/announcements/{id}", func(w http.ResponseWriter, r *http.Request) {
			var input AnnouncementInput
			if !decode(w, r, &input) {
				return
			}
			a, err := service.SaveAnnouncement(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input)
			respond(w, a, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/announcements/{id}/end", func(w http.ResponseWriter, r *http.Request) {
			respond(w, ok, service.EndAnnouncement(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
		})

		r.With(Require(RoleSupport)).Post("/workspaces/{id}/invitations/{invitationId}/resend", func(w http.ResponseWriter, r *http.Request) {
			var input reasonBody
			if !decode(w, r, &input) {
				return
			}
			result, err := service.ResendInvitation(r.Context(), actorFrom(r), chi.URLParam(r, "id"), chi.URLParam(r, "invitationId"), input.Reason)
			respond(w, result, err)
		})

		r.Get("/envelopes", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			list, err := service.ListEnvelopes(r.Context(), q.Get("query"), EnvelopeStatusFilter(q.Get("status")), q.Get("workspaceId"), pageFrom(r))
			respond(w, list, err)
		})
		r.Get("/envelopes/{id}", func(w http.ResponseWriter, r *http.Request) {
			detail, err := service.GetEnvelope(r.Context(), chi.URLParam(r, "id"))
			respond(w, detail, err)
		})
		r.With(Require(RoleSupport)).Post("/envelopes/{id}/resend", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			result, err := service.ResendEnvelope(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, result, err)
		})
		r.With(Require(RoleSupport)).Post("/envelopes/{id}/extend", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				ExpiresAt time.Time `json:"expiresAt"`
				Reason    string    `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			result, err := service.ExtendEnvelope(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.ExpiresAt, input.Reason)
			respond(w, result, err)
		})
		r.With(Require(RoleSuperAdmin)).Post("/envelopes/{id}/void", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			err := service.VoidEnvelope(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, map[string]bool{"ok": true}, err)
		})

		r.Get("/jobs", func(w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			list, err := service.ListEmailJobs(r.Context(), q.Get("query"), JobStateFilter(q.Get("status")), q.Get("kind"), pageFrom(r))
			respond(w, list, err)
		})
		r.Get("/jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
			detail, err := service.GetEmailJob(r.Context(), chi.URLParam(r, "id"))
			respond(w, detail, err)
		})
		r.With(Require(RoleSupport)).Post("/jobs/retry", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			result, err := service.RetryStuckEmailJobs(r.Context(), actorFrom(r), input.Reason)
			respond(w, result, err)
		})
		r.With(Require(RoleSupport)).Post("/jobs/{id}/retry", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Reason string `json:"reason"`
			}
			if !decode(w, r, &input) {
				return
			}
			job, err := service.RetryEmailJob(r.Context(), actorFrom(r), chi.URLParam(r, "id"), input.Reason)
			respond(w, job, err)
		})
	}
}

type reasonBody struct {
	Reason string `json:"reason"`
}

var ok = map[string]bool{"ok": true}

func actorFrom(r *http.Request) Actor {
	a, _ := FromContext(r.Context())
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		ip = host
	}
	return Actor{Admin: a, IPAddress: ip, UserAgent: r.UserAgent()}
}

func decode(w http.ResponseWriter, r *http.Request, into any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "invalid request body")
		return false
	}
	return true
}

func statusFilter(value string) string {
	if value == "active" || value == "suspended" {
		return value
	}
	return ""
}

func pageFrom(r *http.Request) Page {
	number, _ := strconv.Atoi(r.URL.Query().Get("page"))
	size, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	return Page{Number: number, Size: size}
}

func respond(w http.ResponseWriter, value any, err error) {
	var actionErr *ActionError
	switch {
	case errors.As(err, &actionErr):
		writeError(w, actionErr.Status, actionErr.Code, actionErr.Message)
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "not found")
	case err != nil:
		slog.Error("admin request failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	default:
		writeJSON(w, http.StatusOK, value)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": message, "code": code})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
