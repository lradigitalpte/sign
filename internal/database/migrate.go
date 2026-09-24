package database

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Migrate(ctx context.Context, pool *pgxpool.Pool, directory string) error {
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return fmt.Errorf("create schema migrations table: %w", err)
	}

	entries, err := os.ReadDir(directory)
	if err != nil {
		return fmt.Errorf("read migrations directory: %w", err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied {
			continue
		}

		contents, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		up, err := migrationUp(string(contents))
		if err != nil {
			return fmt.Errorf("parse migration %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err = tx.Exec(ctx, up); err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}

func migrationUp(contents string) (string, error) {
	const upMarker = "-- +goose Up"
	const downMarker = "-- +goose Down"
	start := strings.Index(contents, upMarker)
	if start < 0 {
		return "", fmt.Errorf("missing Up marker")
	}
	up := contents[start+len(upMarker):]
	if end := strings.Index(up, downMarker); end >= 0 {
		up = up[:end]
	}
	if strings.TrimSpace(up) == "" {
		return "", fmt.Errorf("empty Up migration")
	}
	return up, nil
}
