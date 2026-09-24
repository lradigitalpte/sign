package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/field"
	"signing-platform/internal/identity"
)

func fieldRoutes(service *field.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if err != nil {
				writeJSON(w, 500, map[string]string{"error": "unable to list fields"})
				return
			}
			writeJSON(w, 200, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			var input field.CreateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, 400, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Create(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), input)
			if errors.Is(err, field.ErrNotFound) {
				writeJSON(w, 404, map[string]string{"error": "editable document or recipient not found"})
				return
			}
			if err != nil {
				writeJSON(w, 400, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, 201, value)
		})
		router.Patch("/{fieldID}", func(w http.ResponseWriter, r *http.Request) {
			var input field.UpdateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, 400, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Update(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "fieldID"), input)
			if errors.Is(err, field.ErrNotFound) {
				writeJSON(w, 404, map[string]string{"error": "editable field not found"})
				return
			}
			if err != nil {
				writeJSON(w, 400, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, 200, value)
		})
		router.Delete("/{fieldID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "fieldID"))
			if errors.Is(err, field.ErrNotFound) {
				writeJSON(w, 404, map[string]string{"error": "editable field not found"})
				return
			}
			if err != nil {
				writeJSON(w, 500, map[string]string{"error": "unable to delete field"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
}
