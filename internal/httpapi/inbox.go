package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/identity"
	"signing-platform/internal/inbox"
)

func inboxRoutes(service *inbox.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			items, err := service.List(r.Context(), session.User.Email)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load inbox"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": items})
		})
		router.Post("/{recipientID}/access", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			token, err := service.Access(r.Context(), session.User.Email, chi.URLParam(r, "recipientID"))
			if errors.Is(err, inbox.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "inbox item not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"token": token})
		})
	}
}
