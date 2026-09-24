package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/identity"
	"signing-platform/internal/recipient"
)

func recipientRoutes(service *recipient.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list recipients"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			var input recipient.CreateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Create(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), input)
			if errors.Is(err, recipient.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "draft envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, value)
		})
		router.Patch("/{recipientID}", func(w http.ResponseWriter, r *http.Request) {
			var input recipient.UpdateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Update(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "recipientID"), input)
			if errors.Is(err, recipient.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "draft recipient not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, value)
		})
		router.Delete("/{recipientID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "recipientID"))
			if errors.Is(err, recipient.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "draft recipient not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete recipient"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
}
