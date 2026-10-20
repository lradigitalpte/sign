package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"signing-platform/internal/config"
	"signing-platform/internal/database"
	"signing-platform/internal/email"
	"signing-platform/internal/heartbeat"
	"signing-platform/internal/notify"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/send"
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

	protector, err := securetoken.NewProtector(cfg.TokenEncryptionKey)
	if err != nil {
		logger.Error("configure signing token encryption", "error", err)
		os.Exit(1)
	}

	var relay email.Mailer
	switch {
	case cfg.ResendAPIKey != "":
		relay = email.NewResend(cfg.ResendAPIKey, cfg.ResendFrom)
	case cfg.SMTPHost != "":
		relay = email.NewSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom)
	}
	if cfg.Environment != "development" && relay == nil {
		logger.Error("RESEND_API_KEY or SMTP_HOST is required outside development")
		os.Exit(1)
	}

	var mailer email.Mailer = relay
	if cfg.Environment == "development" {
		preview, err := email.NewPreview(cfg.EmailPreviewDir, logger, relay)
		if err != nil {
			logger.Error("configure email preview", "error", err)
			os.Exit(1)
		}
		mailer = preview
		go func() {
			if err := preview.ListenAndServe(ctx, cfg.EmailPreviewAddress); err != nil {
				logger.Error("email preview server", "error", err)
			}
		}()
	}

	// Lets the admin System page see this worker and its jobs.
	go heartbeat.RunInstance(ctx, db, "worker", []string{"email", "scheduler"}, logger)

	// Automatic reminders and envelope expiration run alongside email delivery.
	go send.NewScheduler(db, send.NewTokenGenerator(protector), logger).Run(ctx, time.Minute)

	processor := notify.NewProcessor(notify.NewPostgresStore(db), mailer, protector, cfg.SigningOrigin, logger).
		WithMonitor(heartbeat.NewThrottled(db, heartbeat.JobEmailDelivery, heartbeat.Interval))
	logger.Info("worker started", "environment", cfg.Environment)
	if err := processor.Run(ctx, 0); err != nil {
		logger.Error("worker stopped", "error", err)
		os.Exit(1)
	}
	logger.Info("worker stopped")
}
