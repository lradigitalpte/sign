package httpapi

import (
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/document"
	"signing-platform/internal/identity"
)

func documentRoutes(service *document.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if err != nil {
				slog.ErrorContext(r.Context(), "list envelope documents", "error", err, "envelope_id", chi.URLParam(r, "envelopeID"))
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list documents"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, document.MaxUploadSize+(1<<20))
			if err := r.ParseMultipartForm(document.MaxUploadSize); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid or oversized upload"})
				return
			}
			file, header, err := r.FormFile("file")
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "PDF file is required"})
				return
			}
			defer file.Close()
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Upload(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), header.Filename, header.Size, file)
			if errors.Is(err, document.ErrInvalidPDF) {
				writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": err.Error()})
				return
			}
			if errors.Is(err, document.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "draft envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, value)
		})
		router.Get("/{documentID}/download", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			value, body, err := service.Download(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "documentID"), r.URL.Query().Get("version") == "completed")
			if errors.Is(err, document.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "document not found"})
				return
			}
			if err != nil {
				slog.ErrorContext(r.Context(), "download envelope document", "error", err, "envelope_id", chi.URLParam(r, "envelopeID"), "document_id", chi.URLParam(r, "documentID"), "completed", r.URL.Query().Get("version") == "completed")
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to download document"})
				return
			}
			defer body.Close()
			w.Header().Set("Content-Type", "application/pdf")
			w.Header().Set("Content-Disposition", `inline; filename="`+value.Filename+`"`)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, body)
		})
		router.Delete("/{documentID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "documentID"))
			if errors.Is(err, document.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "document not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete document"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
}
