package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/admin"
	"signing-platform/internal/attachment"
	platformauth "signing-platform/internal/auth"
	"signing-platform/internal/billing"
	"signing-platform/internal/config"
	"signing-platform/internal/document"
	"signing-platform/internal/envelope"
	"signing-platform/internal/features"
	"signing-platform/internal/field"
	"signing-platform/internal/folder"
	"signing-platform/internal/identity"
	"signing-platform/internal/inbox"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/members"
	"signing-platform/internal/recipient"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/send"
	"signing-platform/internal/signatureprefs"
	"signing-platform/internal/signing"
	"signing-platform/internal/storage"
	"signing-platform/internal/webhooks"
)

func New(cfg config.Config, db *pgxpool.Pool, logger *slog.Logger, verifier platformauth.Verifier, users *identity.Service, envelopes *envelope.Service, duplicator *envelope.Duplicator, documents *document.Service, recipients *recipient.Service, attachments *attachment.Service, fields *field.Service, folders *folder.Service, sender *send.Service, signer *signing.Service, inboxService *inbox.Service, membersService *members.Service, signaturePreferences *signatureprefs.Service, objects storage.Resolver, storageSettings *storage.OrgResolver, protector *securetoken.Protector) *http.Server {
	webhookProcessor := webhooks.NewProcessor(db)
	directoryAdmin, _ := users.Admin()
	lifecycleService := lifecycle.New(db, objects, logger).WithDirectory(directoryAdmin)
	adminService := admin.NewService(db).WithSigningLinks(send.NewTokenGenerator(protector)).WithInvitations(membersService).WithWebhooks(webhookProcessor).
		WithLifecycle(lifecycleService).WithDocuments(documents).WithSystem(systemOptions(cfg, storageSettings)).WithDirectory(directoryAdmin)
	teams := &teamAccess{db: db}
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(requestLogger(logger))
	router.Use(middleware.Recoverer)
	// The customer app and the admin app each get their own allowed origin, so neither can call the other's routes.
	webCORS := cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.WebOrigin},
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token", identity.WorkspaceHeader},
		ExposedHeaders:   []string{"Content-Disposition", "X-PDF-Security-File-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	adminCORS := cors.Handler(cors.Options{
		AllowedOrigins: []string{cfg.AdminOrigin},
		AllowedMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
		MaxAge:         300,
	})
	router.Use(func(next http.Handler) http.Handler {
		web, adm := webCORS(next), adminCORS(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/admin/") {
				adm.ServeHTTP(w, r)
				return
			}
			web.ServeHTTP(w, r)
		})
	})

	router.Route("/admin/v1", func(r chi.Router) {
		r.Use(platformauth.Middleware(verifier))
		r.Use(admin.Middleware(adminService))
		r.Group(admin.Routes(adminService))
	})

	// WorkOS calls this directly, signed with WORKOS_WEBHOOK_SECRET; no user session is involved.
	router.Post("/webhooks/workos", webhooks.Handler(cfg.WorkOSWebhookSecret, webhookProcessor, logger))
	// Stripe calls this directly, signed with STRIPE_WEBHOOK_SECRET.
	payments := billing.NewStripe(db, cfg.StripeSecretKey, cfg.StripeWebhookSecret, cfg.WebOrigin, logger)
	router.Post("/webhooks/stripe", stripeWebhookHandler(payments))

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
		r.Get("/invitations/{token}", invitationPreviewHandler(membersService))
		r.Get("/plans", planPricesHandler(db))

		r.Group(func(r chi.Router) {
			r.Use(platformauth.Middleware(verifier))
			r.Use(identity.Middleware(users))
			r.Use(readOnlyForViewers)
			// Plan limits (only where the plan-enforcement flag is on).
			r.Use(planGate(db))
			r.Post("/invitations/{token}/accept", acceptInvitationHandler(membersService))
			r.Route("/workspaces", workspaceRoutes(users, membersService))
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
			// The workspace's plan (set by Signet staff) and which feature flags are on for it.
			r.Get("/workspace/subscription", func(w http.ResponseWriter, request *http.Request) {
				current, _ := identity.SessionFromContext(request.Context())
				subscription, err := billing.Load(request.Context(), db, current.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load plan"})
					return
				}
				writeJSON(w, http.StatusOK, subscription)
			})
			r.Get("/features", func(w http.ResponseWriter, request *http.Request) {
				current, _ := identity.SessionFromContext(request.Context())
				flags, err := features.ForWorkspace(request.Context(), db, current.Workspace.ID)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load features"})
					return
				}
				writeJSON(w, http.StatusOK, map[string]any{"flags": flags})
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
					// The retention job reads this section, so bad values are refused rather than silently ignored.
					if section == "retention" {
						if message := validateRetention(config); message != "" {
							writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
							return
						}
					}
					_, err := db.Exec(request.Context(), `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, $2, $3) ON CONFLICT (organization_id, section) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`, current.Workspace.ID, section, config)
					if err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to save settings"})
						return
					}
					writeJSON(w, http.StatusOK, map[string]any{"section": section, "config": config})
				})
			})
			r.Group(privacyRoutes(db, lifecycleService))
			r.Route("/members", memberRoutes(membersService))
			r.Get("/workspace", workspaceOverviewHandler(db))
			r.Patch("/workspace", renameWorkspaceHandler(db, directoryAdmin))
			r.Route("/workspace/storage", storageRoutes(storageSettings))
			r.Route("/billing", billingRoutes(payments))
			r.Route("/account/security", newAccountSecurity(cfg.WorkOSAPIKey, membersService.Mailer(), logger).routes)
			r.Route("/groups", groupRoutes(db))
			r.Route("/teams", teams.routes)
			r.Route("/team/settings/{section}", teamSettingsRoutes(db))
			r.Route("/pdf-security", (&pdfSecurityAPI{db: db, objects: objects, vault: protector}).routes)
			r.Route("/inbox", inboxRoutes(inboxService))
			r.Route("/folders", folderRoutes(folders))
			r.Route("/envelopes", envelopeRoutes(envelopes, duplicator, teams, func(item chi.Router) {
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

// systemOptions describes this deployment to the admin System page.
func systemOptions(cfg config.Config, storageSettings *storage.OrgResolver) admin.SystemOptions {
	options := admin.SystemOptions{
		Environment:    cfg.Environment,
		EmbeddedWorker: cfg.EmbeddedWorker,
		StorageBucket:  cfg.StorageBucket,
		WorkOSJWKSURL:  cfg.WorkOSJWKSURL,
	}
	if storageSettings != nil {
		if checker, ok := storageSettings.Platform().(interface{ Check(context.Context) error }); ok {
			options.Storage = checker
		}
	}
	switch {
	case cfg.ResendAPIKey != "":
		options.EmailProvider = "resend"
	case cfg.SMTPHost != "":
		options.EmailProvider = "smtp"
		options.SMTPAddress = net.JoinHostPort(cfg.SMTPHost, strconv.Itoa(cfg.SMTPPort))
	}
	return options
}
