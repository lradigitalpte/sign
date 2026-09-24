package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/document"
	"signing-platform/internal/envelope"
	"signing-platform/internal/identity"
	"signing-platform/internal/pdfutil"
	"signing-platform/internal/send"
)

func sendRoutes(service *send.Service, envelopes *envelope.Service, documents *document.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/review", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			review, err := service.Review(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if errors.Is(err, send.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to review envelope"})
				return
			}
			writeJSON(w, http.StatusOK, review)
		})
		router.Post("/send", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			result, err := service.Send(r.Context(), session.Workspace.ID, session.User.ID, chi.URLParam(r, "envelopeID"), r.Header.Get("Idempotency-Key"))
			if errors.Is(err, send.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "draft envelope not found"})
				return
			}
			if errors.Is(err, send.ErrAlreadySent) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "envelope has already been sent"})
				return
			}
			if errors.Is(err, send.ErrIsTemplate) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			if errors.Is(err, send.ErrNotReady) {
				review, _ := service.Review(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
				writeJSON(w, http.StatusConflict, map[string]any{"error": "envelope is not ready to send", "review": review})
				return
			}
			if errors.Is(err, send.ErrIdempotencyKey) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to send envelope"})
				return
			}
			writeJSON(w, http.StatusOK, result)
		})
		router.Post("/reminders", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			result, err := service.Remind(r.Context(), session.Workspace.ID, session.User.ID, chi.URLParam(r, "envelopeID"))
			if errors.Is(err, send.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
				return
			}
			if errors.Is(err, send.ErrNotInProgress) || errors.Is(err, send.ErrNothingToRemind) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to send reminders"})
				return
			}
			writeJSON(w, http.StatusOK, result)
		})
		router.Post("/share-links/{recipientID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			token, err := service.ShareLink(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"), chi.URLParam(r, "recipientID"))
			if errors.Is(err, send.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "recipient not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to create secure link"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"token": token})
		})
		router.Post("/void", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			value, err := envelopes.Void(r.Context(), session.Workspace.ID, session.User.ID, chi.URLParam(r, "envelopeID"))
			writeEnvelopeMutation(w, value, err)
		})
		router.Get("/audit", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			events, err := envelopes.ListAudit(r.Context(), session.Workspace.ID, chi.URLParam(r, "envelopeID"))
			if errors.Is(err, envelope.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load audit trail"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": events})
		})
		router.Get("/certificate", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			envelopeID := chi.URLParam(r, "envelopeID")
			value, err := envelopes.Get(r.Context(), session.Workspace.ID, envelopeID)
			if errors.Is(err, envelope.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load envelope"})
				return
			}
			docs, err := documents.List(r.Context(), session.Workspace.ID, envelopeID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load documents"})
				return
			}
			events, err := envelopes.ListAudit(r.Context(), session.Workspace.ID, envelopeID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load audit trail"})
				return
			}
			lines := []string{
				"Envelope ID: " + value.ID,
				"Title: " + value.Title,
				"Status: " + value.Status,
				"Generated: " + time.Now().UTC().Format(time.RFC3339),
				"",
			}
			for _, doc := range docs {
				lines = append(lines, fmt.Sprintf("Document: %s", doc.Filename))
				lines = append(lines, "  SHA-256: "+doc.SHA256)
				if doc.CompletedSHA256 != nil && *doc.CompletedSHA256 != "" {
					lines = append(lines, "  Completed SHA-256: "+*doc.CompletedSHA256)
				}
			}
			if len(docs) > 0 {
				lines = append(lines, "")
			}
			for _, event := range events {
				actor := "system"
				if event.ActorName != nil && strings.TrimSpace(*event.ActorName) != "" {
					actor = *event.ActorName
				} else if event.RecipientName != nil && strings.TrimSpace(*event.RecipientName) != "" {
					actor = *event.RecipientName
				}
				lines = append(lines, fmt.Sprintf("%s  %s  %s", event.OccurredAt.UTC().Format(time.RFC3339), event.EventType, actor))
			}
			pdf, err := pdfutil.Evidence(value.Title+" — evidence certificate", lines)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to generate certificate"})
				return
			}
			filename := "evidence-certificate.pdf"
			w.Header().Set("Content-Type", "application/pdf")
			w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(pdf)
		})
	}
}
