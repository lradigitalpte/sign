package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/attachment"
	platformauth "signing-platform/internal/auth"
	"signing-platform/internal/config"
	"signing-platform/internal/document"
	"signing-platform/internal/envelope"
	"signing-platform/internal/field"
	"signing-platform/internal/folder"
	"signing-platform/internal/identity"
	"signing-platform/internal/inbox"
	"signing-platform/internal/members"
	"signing-platform/internal/recipient"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/send"
	"signing-platform/internal/signatureprefs"
	"signing-platform/internal/signing"
	"signing-platform/internal/storage"
)

func New(cfg config.Config, db *pgxpool.Pool, logger *slog.Logger, verifier platformauth.Verifier, users *identity.Service, envelopes *envelope.Service, duplicator *envelope.Duplicator, documents *document.Service, recipients *recipient.Service, attachments *attachment.Service, fields *field.Service, folders *folder.Service, sender *send.Service, signer *signing.Service, inboxService *inbox.Service, membersService *members.Service, signaturePreferences *signatureprefs.Service, objects storage.Resolver, storageSettings *storage.OrgResolver, protector *securetoken.Protector) *http.Server {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(requestLogger(logger))
	router.Use(middleware.Recoverer)
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.WebOrigin},
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Content-Disposition", "X-PDF-Security-File-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	router.Get("/healthz", live)
	router.Get("/readyz", ready(db))

	router.Route("/v1", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{
				"name":    "signing-platform-api",
				"version": "v1",
			})
		})

		r.Route("/sign/{token}", signingRoutes(signer))

		r.Group(func(r chi.Router) {
			r.Use(platformauth.Middleware(verifier))
			r.Use(identity.Middleware(users))
			r.Get("/me", func(w http.ResponseWriter, request *http.Request) {
				current, _ := identity.SessionFromContext(request.Context())
				session, _ := platformauth.IdentityFromContext(request.Context())
				writeJSON(w, http.StatusOK, struct {
					identity.Session
					Permissions []string `json:"permissions,omitempty"`
				}{Session: current, Permissions: session.Permissions})
			})
			r.Patch("/me", func(w http.ResponseWriter, request *http.Request) {
				var input struct {
					Name          string  `json:"name"`
					AvatarDataURL *string `json:"avatarDataUrl"`
				}
				decoder := json.NewDecoder(http.MaxBytesReader(w, request.Body, 3<<20))
				if err := decoder.Decode(&input); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				current, _ := identity.SessionFromContext(request.Context())
				user, err := users.UpdateProfile(request.Context(), current.User.ID, input.Name, input.AvatarDataURL)
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
					return
				}
				writeJSON(w, http.StatusOK, user)
			})
			r.Get("/me/signature-preferences", signaturePreferenceRoutes(signaturePreferences))
			r.Put("/me/signature-preferences", signaturePreferenceRoutes(signaturePreferences))
			r.Route("/workspace/settings/{section}", func(settings chi.Router) {
				allowed := map[string]bool{"security": true, "branding": true, "notifications": true, "preferences": true, "public-profile": true, "billing": true, "invoices": true, "usage": true, "api-keys": true, "webhooks": true, "tags": true, "sso": true, "scim": true, "verification": true, "audit": true, "developer-logs": true, "retention": true, "crypto-keys": true}
				settings.Get("/", func(w http.ResponseWriter, request *http.Request) {
					section := chi.URLParam(request, "section")
					if !allowed[section] {
						writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown settings section"})
						return
					}
					current, _ := identity.SessionFromContext(request.Context())
					var config json.RawMessage
					err := db.QueryRow(request.Context(), `SELECT COALESCE((SELECT config FROM organization_settings WHERE organization_id = $1::uuid AND section = $2), '{}'::jsonb)`, current.Workspace.ID, section).Scan(&config)
					if err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load settings"})
						return
					}
					writeJSON(w, http.StatusOK, map[string]any{"section": section, "config": config})
				})
				settings.Put("/", func(w http.ResponseWriter, request *http.Request) {
					section := chi.URLParam(request, "section")
					if !allowed[section] {
						writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown settings section"})
						return
					}
					var config map[string]any
					if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 1<<20)).Decode(&config); err != nil {
						writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid settings"})
						return
					}
					current, _ := identity.SessionFromContext(request.Context())
					if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
						writeJSON(w, http.StatusForbidden, map[string]string{"error": "administrator access required"})
						return
					}
					_, err := db.Exec(request.Context(), `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, $2, $3) ON CONFLICT (organization_id, section) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`, current.Workspace.ID, section, config)
					if err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to save settings"})
						return
					}
					writeJSON(w, http.StatusOK, map[string]any{"section": section, "config": config})
				})
			})
			r.Route("/members", memberRoutes(membersService))
			r.Route("/workspace/storage", storageRoutes(storageSettings))
			r.Group(collaborationRoutes(db))
			r.Route("/pdf-security", (&pdfSecurityAPI{db: db, objects: objects, vault: protector}).routes)
			r.Route("/inbox", inboxRoutes(inboxService))
			r.Route("/folders", folderRoutes(folders))
			r.Route("/envelopes", envelopeRoutes(envelopes, duplicator, func(item chi.Router) {
				item.Route("/documents", documentRoutes(documents))
				item.Route("/recipients", recipientRoutes(recipients))
				item.Route("/attachments", attachmentRoutes(attachments))
				item.Route("/fields", fieldRoutes(fields))
				sendRoutes(sender, envelopes, documents)(item)
			}))
		})
	})

	return &http.Server{
		Addr:         cfg.APIAddress,
		Handler:      router,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}
}

func IsExpectedShutdown(err error) bool {
	return err == nil || errors.Is(err, http.ErrServerClosed)
}
