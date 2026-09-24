package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/envelope"
	"signing-platform/internal/identity"
)

func envelopeRoutes(service *envelope.Service, duplicator *envelope.Duplicator, details func(chi.Router)) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			filter := envelope.ListFilter{
				Status:   r.URL.Query().Get("status"),
				FolderID: r.URL.Query().Get("folderId"),
			}
			if r.URL.Query().Get("type") == "template" {
				isTemplate := true
				filter.IsTemplate = &isTemplate
			}
			values, err := service.List(r.Context(), session.Workspace.ID, filter)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			var input envelope.CreateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Create(r.Context(), session.Workspace.ID, session.User.ID, input)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, value)
		})
		router.Post("/bulk/move", func(w http.ResponseWriter, r *http.Request) {
			var input envelope.BulkMoveInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			affected, err := service.BulkMoveToFolder(r.Context(), session.Workspace.ID, input)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"affected": affected})
		})
		router.Post("/bulk/delete", func(w http.ResponseWriter, r *http.Request) {
			var input envelope.BulkIDsInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			affected, err := service.BulkDelete(r.Context(), session.Workspace.ID, input)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"affected": affected})
		})
		router.Post("/bulk/void", func(w http.ResponseWriter, r *http.Request) {
			var input envelope.BulkIDsInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			affected, err := service.BulkVoid(r.Context(), session.Workspace.ID, session.User.ID, input)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"affected": affected})
		})
		router.Route("/{envelopeID}", func(item chi.Router) {
			item.Get("/", func(w http.ResponseWriter, r *http.Request) {
				session, _ := identity.SessionFromContext(r.Context())
				value, err := service.Get(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
				if errors.Is(err, envelope.ErrNotFound) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load envelope"})
					return
				}
				writeJSON(w, http.StatusOK, value)
			})
			item.Patch("/", func(w http.ResponseWriter, r *http.Request) {
				var input envelope.UpdateInput
				decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
				decoder.DisallowUnknownFields()
				if err := decoder.Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				session, _ := identity.SessionFromContext(r.Context())
				value, err := service.Update(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), input)
				writeEnvelopeMutation(w, value, err)
			})
			item.Delete("/", func(w http.ResponseWriter, r *http.Request) {
				session, _ := identity.SessionFromContext(r.Context())
				err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
				if errors.Is(err, envelope.ErrNotFound) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
					return
				}
				if errors.Is(err, envelope.ErrNotEditable) {
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete envelope"})
					return
				}
				w.WriteHeader(http.StatusNoContent)
			})
			item.Patch("/folder", func(w http.ResponseWriter, r *http.Request) {
				var input envelope.MoveFolderInput
				decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
				decoder.DisallowUnknownFields()
				if err := decoder.Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				session, _ := identity.SessionFromContext(r.Context())
				value, err := service.MoveToFolder(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), input)
				writeEnvelopeMutation(w, value, err)
			})
			item.Post("/duplicate", func(w http.ResponseWriter, r *http.Request) {
				session, _ := identity.SessionFromContext(r.Context())
				value, err := duplicator.Duplicate(r.Context(), session.Workspace.ID, session.User.ID, chi.URLParam(r, "envelopeID"), false)
				if errors.Is(err, envelope.ErrNotFound) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
					return
				}
				if errors.Is(err, envelope.ErrNotEditable) {
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					slog.ErrorContext(r.Context(), "duplicate envelope", "error", err, "envelope_id", chi.URLParam(r, "envelopeID"))
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to duplicate envelope"})
					return
				}
				writeJSON(w, http.StatusCreated, value)
			})
			item.Post("/save-as-template", func(w http.ResponseWriter, r *http.Request) {
				session, _ := identity.SessionFromContext(r.Context())
				value, err := duplicator.Duplicate(r.Context(), session.Workspace.ID, session.User.ID, chi.URLParam(r, "envelopeID"), true)
				if errors.Is(err, envelope.ErrNotFound) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
					return
				}
				if errors.Is(err, envelope.ErrNotEditable) {
					writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
					return
				}
				if err != nil {
					slog.ErrorContext(r.Context(), "save envelope as template", "error", err, "envelope_id", chi.URLParam(r, "envelopeID"))
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to save template"})
					return
				}
				writeJSON(w, http.StatusCreated, value)
			})
			details(item)
		})
	}
}

func writeEnvelopeMutation(w http.ResponseWriter, value envelope.Envelope, err error) {
	if errors.Is(err, envelope.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
		return
	}
	if errors.Is(err, envelope.ErrNotEditable) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, value)
}
