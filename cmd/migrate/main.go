package main

import (
	"context"
	"log/slog"
	"os"

	"signing-platform/internal/config"
	"signing-platform/internal/database"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool, "db/migrations"); err != nil {
		logger.Error("apply migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("database migrations applied")
}
