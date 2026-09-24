package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/identity"
	"signing-platform/internal/members"
)

func memberRoutes(service *members.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list members"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})

		router.Patch("/{memberID}/role", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Role string `json:"role"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			memberID := chi.URLParam(r, "memberID")
			if err := service.UpdateRole(r.Context(), session.Workspace.ID, memberID, input.Role); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		})

		router.Delete("/{memberID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			memberID := chi.URLParam(r, "memberID")
			if err := service.Remove(r.Context(), session.Workspace.ID, memberID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
		})

		router.Get("/invitations", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.ListInvitations(r.Context(), session.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list invitations"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})

		router.Post("/invite", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				Email string `json:"email"`
				Role  string `json:"role"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			invitation, err := service.Invite(r.Context(), session.Workspace.ID, session.User.ID, input.Email, input.Role)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, invitation)
		})

		router.Delete("/invitations/{invitationID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			invitationID := chi.URLParam(r, "invitationID")
			if err := service.RevokeInvitation(r.Context(), session.Workspace.ID, invitationID); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
		})

		router.Post("/invitations/{invitationID}/resend", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			invitationID := chi.URLParam(r, "invitationID")
			invitation, err := service.ResendInvitation(r.Context(), session.Workspace.ID, invitationID)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, invitation)
		})
	}
}
