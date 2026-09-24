package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	platformauth "signing-platform/internal/auth"
	"signing-platform/internal/attachment"
	"signing-platform/internal/config"
	"signing-platform/internal/database"
	"signing-platform/internal/document"
	"signing-platform/internal/email"
	"signing-platform/internal/envelope"
	"signing-platform/internal/field"
	"signing-platform/internal/finalize"
	"signing-platform/internal/folder"
	"signing-platform/internal/httpapi"
	"signing-platform/internal/identity"
	"signing-platform/internal/inbox"
	"signing-platform/internal/members"
	"signing-platform/internal/notify"
	"signing-platform/internal/recipient"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/send"
	"signing-platform/internal/signatureprefs"
	"signing-platform/internal/signing"
	"signing-platform/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db, "db/migrations"); err != nil {
		logger.Error("apply database migrations", "error", err)
		os.Exit(1)
	}

	verifier, err := platformauth.NewWorkOSVerifier(cfg.WorkOSClientID, cfg.WorkOSIssuer, cfg.WorkOSJWKSURL)
	if err != nil {
		logger.Error("configure WorkOS authentication", "error", err)
		os.Exit(1)
	}
	directory, err := identity.NewWorkOSDirectory(cfg.WorkOSAPIKey)
	if err != nil {
		logger.Error("configure WorkOS user directory", "error", err)
		os.Exit(1)
	}
	users := identity.NewService(directory, identity.NewPostgresStore(db))
	envelopes := envelope.NewService(envelope.NewPostgresStore(db))
	objects, err := storage.NewMinIO(ctx, cfg.StorageEndpoint, cfg.StorageAccessKey, cfg.StorageSecretKey, cfg.StorageBucket, cfg.StorageUseSSL)
	if err != nil {
		logger.Error("configure document storage", "error", err)
		os.Exit(1)
	}
	protector, err := securetoken.NewProtector(cfg.TokenEncryptionKey)
	if err != nil {
		logger.Error("configure signing token encryption", "error", err)
		os.Exit(1)
	}
	objectResolver := storage.NewOrgResolver(db, objects, protector)
	duplicator := envelope.NewDuplicator(db, objectResolver)
	finalizer := finalize.NewService(finalize.NewPostgresStore(db), objectResolver)
	documents := document.NewService(document.NewPostgresStore(db), objectResolver).WithCompleter(finalizer)
	recipients := recipient.NewService(recipient.NewPostgresStore(db))
	attachments := attachment.NewService(attachment.NewPostgresStore(db), objectResolver)
	fields := field.NewService(field.NewPostgresStore(db))
	folders := folder.NewService(folder.NewPostgresStore(db))
	signaturePreferences := signatureprefs.NewService(signatureprefs.NewPostgresStore(db), protector)
	sender := send.NewService(send.NewPostgresStore(db), func() (send.Token, error) {
		raw, hash, err := securetoken.Generate()
		if err != nil {
			return send.Token{}, err
		}
		ciphertext, err := protector.Encrypt([]byte(raw))
		if err != nil {
			return send.Token{}, err
		}
		return send.Token{Raw: raw, Hash: hash, Ciphertext: ciphertext}, nil
	})
	signer := signing.NewService(signing.NewPostgresStore(db), objectResolver).
		WithFinalizer(finalizer).
		WithCompleter(sender)
	inboxService := inbox.NewService(inbox.NewPostgresStore(db))
	membersService := members.NewService(db)

	// Deployments without a separate worker service can drain the email queue from the API process.
	// Jobs are claimed with SKIP LOCKED, so this is safe alongside cmd/worker.
	if cfg.EmbeddedWorker {
		var mailer email.Mailer
		switch {
		case cfg.ResendAPIKey != "":
			mailer = email.NewResend(cfg.ResendAPIKey, cfg.ResendFrom)
		case cfg.SMTPHost != "":
			mailer = email.NewSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom)
		default:
			logger.Error("EMBEDDED_WORKER requires RESEND_API_KEY or SMTP_HOST")
			os.Exit(1)
		}
		processor := notify.NewProcessor(notify.NewPostgresStore(db), mailer, protector, cfg.SigningOrigin, logger)
		go func() {
			logger.Info("embedded email worker started")
			if err := processor.Run(ctx, 0); err != nil {
				logger.Error("embedded email worker stopped", "error", err)
			}
		}()
	}

	server := httpapi.New(cfg, db, logger, verifier, users, envelopes, duplicator, documents, recipients, attachments, fields, folders, sender, signer, inboxService, membersService, signaturePreferences, objectResolver, objectResolver, protector)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("api listening", "address", cfg.APIAddress, "environment", cfg.Environment)
		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutdown requested")
	case err := <-errCh:
		if !httpapi.IsExpectedShutdown(err) {
			logger.Error("api stopped unexpectedly", "error", err)
			os.Exit(1)
		}
		return
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("api stopped")
}
