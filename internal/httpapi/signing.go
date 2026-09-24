package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/signing"
)

func signingRoutes(service *signing.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, err := service.Session(r.Context(), tokenHash(r))
			writeSigning(w, session, err)
		})
		router.Post("/view", func(w http.ResponseWriter, r *http.Request) {
			session, err := service.View(r.Context(), tokenHash(r), requestAudit(r))
			writeSigning(w, session, err)
		})
		router.Patch("/fields/{fieldID}", func(w http.ResponseWriter, r *http.Request) {
			var body signing.FieldGeometry
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := decoder.Decode(&body); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			field, session, err := service.UpdateFieldPlacement(r.Context(), tokenHash(r), chi.URLParam(r, "fieldID"), body)
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"field": field, "session": session})
		})
		router.Post("/fields", func(w http.ResponseWriter, r *http.Request) {
			var body signing.FieldCreateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := decoder.Decode(&body); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			field, session, err := service.CreateField(r.Context(), tokenHash(r), body)
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"field": field, "session": session})
		})
		router.Delete("/fields/{fieldID}", func(w http.ResponseWriter, r *http.Request) {
			session, err := service.DeleteField(r.Context(), tokenHash(r), chi.URLParam(r, "fieldID"))
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"session": session})
		})
		router.Post("/fields/{fieldID}/upload", func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, signing.MaxFieldUploadSize()+(1<<20))
			if err := r.ParseMultipartForm(signing.MaxFieldUploadSize()); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid or oversized upload"})
				return
			}
			file, header, err := r.FormFile("file")
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file is required"})
				return
			}
			defer file.Close()
			field, session, err := service.UploadFieldFile(r.Context(), tokenHash(r), chi.URLParam(r, "fieldID"), header.Filename, header.Size, file)
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"field": field, "session": session})
		})
		router.Post("/fields/{fieldID}", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Value     json.RawMessage       `json:"value"`
				Placement *signing.FieldPlacement `json:"placement,omitempty"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := decoder.Decode(&body); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			field, session, err := service.SaveField(r.Context(), tokenHash(r), chi.URLParam(r, "fieldID"), body.Value, body.Placement)
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"field": field, "session": session})
		})
		router.Post("/complete", func(w http.ResponseWriter, r *http.Request) {
			session, err := service.Complete(r.Context(), tokenHash(r), requestAudit(r))
			writeSigning(w, session, err)
		})
		router.Post("/decline", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Reason string `json:"reason"`
			}
			_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
			if err := service.Decline(r.Context(), tokenHash(r), body.Reason, requestAudit(r)); err != nil {
				writeSigningErr(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
		})
		router.Get("/attachments/{attachmentID}", func(w http.ResponseWriter, r *http.Request) {
			_, filename, mimeType, body, err := service.DownloadAttachment(r.Context(), tokenHash(r), chi.URLParam(r, "attachmentID"))
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			defer body.Close()
			w.Header().Set("Content-Type", mimeType)
			w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, body)
		})
		router.Get("/documents/{documentID}", func(w http.ResponseWriter, r *http.Request) {
			document, body, err := service.Download(r.Context(), tokenHash(r), chi.URLParam(r, "documentID"))
			if err != nil {
				writeSigningErr(w, err)
				return
			}
			defer body.Close()
			w.Header().Set("Content-Type", "application/pdf")
			w.Header().Set("Content-Disposition", `inline; filename="`+document.Filename+`"`)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, body)
		})
	}
}

func tokenHash(r *http.Request) []byte {
	return securetoken.Hash(chi.URLParam(r, "token"))
}

func requestAudit(r *http.Request) signing.AuditContext {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return signing.AuditContext{IP: host, UserAgent: r.UserAgent()}
}

func writeSigning(w http.ResponseWriter, session signing.Session, err error) {
	if err != nil {
		writeSigningErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func writeSigningErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, signing.ErrInvalidToken):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "signing session not found"})
	case errors.Is(err, signing.ErrUnavailable), errors.Is(err, signing.ErrAlreadyFinished):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	case errors.Is(err, signing.ErrNotReady):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
}
