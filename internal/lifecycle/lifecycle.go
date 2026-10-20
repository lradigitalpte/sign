// Package lifecycle permanently removes customer data: workspaces their owners asked to delete
// (after a 30-day grace period) and finished envelopes past a workspace's retention period.
// Files are deleted from storage first; database rows go only once every file is gone, so a
// storage failure never leaves files that nothing points to. Failed work is retried on the next run.
package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/heartbeat"
	"signing-platform/internal/identity"
	"signing-platform/internal/storage"
)

// DeletionGrace is how long a requested workspace deletion waits, so the owner can change their mind.
const DeletionGrace = 30 * 24 * time.Hour

// Retention limits, in months. Shorter periods are ignored rather than trusted.
const (
	MinRetentionMonths = 3
	MaxRetentionMonths = 120
)

var (
	ErrAlreadyScheduled = errors.New("this workspace is already scheduled for deletion")
	ErrLegalHold        = errors.New("legal hold is on; turn it off on the Retention page before deleting the workspace")
	ErrNoRequest        = errors.New("no deletion is scheduled for this workspace")
	ErrNotDue           = errors.New("this deletion request can't be carried out")
)

type Service struct {
	db        *pgxpool.Pool
	objects   storage.Resolver
	logger    *slog.Logger
	directory identity.DirectoryAdmin
}

func New(db *pgxpool.Pool, objects storage.Resolver, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{db: db, objects: objects, logger: logger}
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func textColumn(ctx context.Context, q querier, sql string, args ...any) ([]string, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []string{}
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

// envelopeKeys lists every stored file of these envelopes: uploads, sealed copies and attachments.
func envelopeKeys(ctx context.Context, q querier, envelopeIDs []string) ([]string, error) {
	return textColumn(ctx, q, `
SELECT object_key FROM documents WHERE envelope_id = ANY($1::uuid[])
UNION ALL SELECT completed_object_key FROM documents WHERE envelope_id = ANY($1::uuid[]) AND completed_object_key IS NOT NULL
UNION ALL SELECT object_key FROM envelope_attachments WHERE envelope_id = ANY($1::uuid[]) AND object_key IS NOT NULL`, envelopeIDs)
}

// workspaceKeys lists every stored file of a workspace, including the PDF security vault.
func workspaceKeys(ctx context.Context, q querier, organizationID string) ([]string, error) {
	return textColumn(ctx, q, `
SELECT d.object_key FROM documents d JOIN envelopes e ON e.id = d.envelope_id WHERE e.organization_id = $1::uuid
UNION ALL SELECT d.completed_object_key FROM documents d JOIN envelopes e ON e.id = d.envelope_id WHERE e.organization_id = $1::uuid AND d.completed_object_key IS NOT NULL
UNION ALL SELECT a.object_key FROM envelope_attachments a JOIN envelopes e ON e.id = a.envelope_id WHERE e.organization_id = $1::uuid AND a.object_key IS NOT NULL
UNION ALL SELECT object_key FROM pdf_security_files WHERE organization_id = $1::uuid`, organizationID)
}

// deleteObjects removes files from the workspace's storage (Signet's or the customer's own bucket).
// It stops at the first failure so the caller keeps the rows and retries later.
func (s *Service) deleteObjects(ctx context.Context, organizationID string, keys []string) (int, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	store, err := s.objects.For(ctx, organizationID)
	if err != nil {
		return 0, fmt.Errorf("open storage: %w", err)
	}
	for i, key := range keys {
		if err := store.Delete(ctx, key); err != nil {
			return i, fmt.Errorf("delete %s: %w", key, err)
		}
	}
	return len(keys), nil
}

// lockKey keeps one lifecycle run at a time across every API process.
const lockKey = 7_412_903_551

// Run deletes due workspaces and expired envelopes every interval until ctx ends.
func (s *Service) Run(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		started := time.Now()
		// Only the process holding the lock did any work, so only it records the run.
		if ran, err := s.RunOnce(ctx); ran && ctx.Err() == nil {
			heartbeat.RecordRun(ctx, s.db, heartbeat.JobLifecycle, interval, started, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunOnce does one pass if no other process is running one. ran is false when another process
// held the lock; err holds what failed, already logged.
func (s *Service) RunOnce(ctx context.Context) (ran bool, err error) {
	conn, err := s.db.Acquire(ctx)
	if err != nil {
		s.logger.Error("lifecycle: acquire connection", "error", err)
		return true, fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()
	var locked bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, lockKey).Scan(&locked); err != nil {
		return true, fmt.Errorf("take lifecycle lock: %w", err)
	}
	if !locked {
		return false, nil
	}
	defer conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, lockKey)

	var errs []error
	if n, err := s.RunDueDeletions(ctx); err != nil {
		s.logger.Error("lifecycle: workspace deletions", "error", err)
		errs = append(errs, fmt.Errorf("workspace deletions: %w", err))
	} else if n > 0 {
		s.logger.Info("lifecycle: workspaces deleted", "count", n)
	}
	if n, err := s.RunDueAccountDeletions(ctx); err != nil {
		s.logger.Error("lifecycle: account deletions", "error", err)
		errs = append(errs, fmt.Errorf("account deletions: %w", err))
	} else if n > 0 {
		s.logger.Info("lifecycle: accounts deleted", "count", n)
	}
	if n, err := s.RunRetention(ctx); err != nil {
		s.logger.Error("lifecycle: retention", "error", err)
		errs = append(errs, fmt.Errorf("retention: %w", err))
	} else if n > 0 {
		s.logger.Info("lifecycle: envelopes deleted by retention", "count", n)
	}
	return true, errors.Join(errs...)
}
