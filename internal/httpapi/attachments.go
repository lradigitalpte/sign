package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/attachment"
	"signing-platform/internal/identity"
)

func attachmentRoutes(service *attachment.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list attachments"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			envelopeID := chi.URLParam(r, "envelopeID")
			contentType := r.Header.Get("Content-Type")
			if strings.HasPrefix(contentType, "multipart/form-data") {
				r.Body = http.MaxBytesReader(w, r.Body, attachment.MaxUploadSize+(1<<20))
				if err := r.ParseMultipartForm(attachment.MaxUploadSize); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid or oversized upload"})
					return
				}
				file, header, err := r.FormFile("file")
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file is required"})
					return
				}
				defer file.Close()
				label := strings.TrimSpace(r.FormValue("label"))
				if label == "" {
					label = header.Filename
				}
				value, err := service.Upload(r.Context(), session.Workspace.ID, envelopeID, label, header.Filename, header.Size, file)
				if errors.Is(err, attachment.ErrInvalidFile) {
					writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": err.Error()})
					return
				}
				if errors.Is(err, attachment.ErrNotFound) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "editable envelope not found"})
					return
				}
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
					return
				}
				writeJSON(w, http.StatusCreated, value)
				return
			}
			var input attachment.CreateLinkInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			value, err := service.CreateLink(r.Context(), session.Workspace.ID, envelopeID, input)
			if errors.Is(err, attachment.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "editable envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, value)
		})
		router.Get("/{attachmentID}/download", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			value, body, err := service.Download(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "attachmentID"))
			if errors.Is(err, attachment.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "attachment not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to download attachment"})
				return
			}
			defer body.Close()
			filename := "attachment"
			if value.Filename != nil {
				filename = *value.Filename
			}
			mimeType := "application/octet-stream"
			if value.MimeType != nil {
				mimeType = *value.MimeType
			}
			w.Header().Set("Content-Type", mimeType)
			w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, body)
		})
		router.Patch("/{attachmentID}", func(w http.ResponseWriter, r *http.Request) {
			var input attachment.UpdateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Update(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "attachmentID"), input)
			if errors.Is(err, attachment.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "editable attachment not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, value)
		})
		router.Delete("/{attachmentID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "attachmentID"))
			if errors.Is(err, attachment.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "editable attachment not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete attachment"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
}
