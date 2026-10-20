package send

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"signing-platform/internal/heartbeat"
	"signing-platform/internal/securetoken"
)

// MaxAutoReminders caps automatic reminders per recipient so an abandoned envelope never emails forever.
const MaxAutoReminders = 10

const reminderBatchSize = 100

// NewTokenGenerator returns the signing-link generator shared by the API and the worker.
func NewTokenGenerator(protector *securetoken.Protector) func() (Token, error) {
	return func() (Token, error) {
		raw, hash, err := securetoken.Generate()
		if err != nil {
			return Token{}, err
		}
		ciphertext, err := protector.Encrypt([]byte(raw))
		if err != nil {
			return Token{}, err
		}
		return Token{Raw: raw, Hash: hash, Ciphertext: ciphertext}, nil
	}
}

// Scheduler runs time-based envelope work: automatic reminders and expiration.
// Rows are claimed with SKIP LOCKED, so several workers can run it at once.
type Scheduler struct {
	db       *pgxpool.Pool
	generate func() (Token, error)
	logger   *slog.Logger
}

func NewScheduler(db *pgxpool.Pool, generate func() (Token, error), logger *slog.Logger) *Scheduler {
	if logger == nil {
		logger = slog.Default()
	}
	return &Scheduler{db: db, generate: generate, logger: logger}
}

func (s *Scheduler) Run(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		started := time.Now()
		err := s.RunOnce(ctx)
		if ctx.Err() == nil {
			heartbeat.RecordRun(ctx, s.db, heartbeat.JobEnvelopeScheduler, interval, started, err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunOnce expires overdue envelopes and queues due reminders. It returns what failed, already logged.
func (s *Scheduler) RunOnce(ctx context.Context) error {
	var expireErr error
	if expired, err := s.ExpireOverdue(ctx); err != nil {
		s.logger.Error("expire overdue envelopes", "error", err)
		expireErr = fmt.Errorf("expire overdue envelopes: %w", err)
	} else if expired > 0 {
		s.logger.Info("envelopes expired", "count", expired)
	}
	for {
		queued, err := s.QueueDueReminders(ctx)
		if err != nil {
			s.logger.Error("queue automatic reminders", "error", err)
			return errors.Join(expireErr, fmt.Errorf("queue automatic reminders: %w", err))
		}
		if queued > 0 {
			s.logger.Info("automatic reminders queued", "count", queued)
		}
		if queued < reminderBatchSize {
			return expireErr
		}
	}
}

func (s *Scheduler) ExpireOverdue(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, `
WITH expired AS (
    UPDATE envelopes SET status='expired', updated_at=now()
    WHERE status='in_progress' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id
)
INSERT INTO audit_events(envelope_id, event_type, metadata)
SELECT id, 'envelope.expired', '{}'::jsonb FROM expired`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// QueueDueReminders emails recipients still waiting on an envelope with automatic reminders on.
// The first reminder goes first_reminder_days after the invitation (or after the last manual reminder),
// then every repeat_reminder_days.
func (s *Scheduler) QueueDueReminders(ctx context.Context) (int, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
SELECT r.id::text, r.envelope_id::text
FROM recipients r
JOIN envelopes e ON e.id = r.envelope_id
WHERE e.status = 'in_progress' AND e.auto_reminders AND NOT e.is_template AND e.distribution_method = 'email'
  AND (e.expires_at IS NULL OR e.expires_at > now())
  AND r.role <> 'cc' AND r.status IN ('sent', 'viewed')
  AND r.auto_reminder_count < $1
  AND COALESCE(r.last_reminded_at, r.sent_at) + make_interval(days => GREATEST(
        CASE WHEN r.auto_reminder_count = 0 THEN e.first_reminder_days ELSE e.repeat_reminder_days END, 1)) <= now()
ORDER BY COALESCE(r.last_reminded_at, r.sent_at)
LIMIT $2
FOR UPDATE OF r SKIP LOCKED`, MaxAutoReminders, reminderBatchSize)
	if err != nil {
		return 0, err
	}
	type due struct{ recipientID, envelopeID string }
	var batch []due
	for rows.Next() {
		var item due
		if err := rows.Scan(&item.recipientID, &item.envelopeID); err != nil {
			rows.Close()
			return 0, err
		}
		batch = append(batch, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, item := range batch {
		if err := inviteRecipients(ctx, tx, item.envelopeID, []string{item.recipientID}, "reminder", false, s.generate); err != nil {
			return 0, err
		}
		if err := markAutoReminded(ctx, tx, item.recipientID, item.envelopeID); err != nil {
			return 0, err
		}
	}
	return len(batch), tx.Commit(ctx)
}

func markAutoReminded(ctx context.Context, tx pgx.Tx, recipientID, envelopeID string) error {
	_, err := tx.Exec(ctx, `UPDATE recipients SET last_reminded_at=now(), auto_reminder_count=auto_reminder_count+1 WHERE id=$1::uuid`, recipientID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, metadata) VALUES($1::uuid,$2::uuid,'envelope.reminded',jsonb_build_object('reminders',1,'automatic',true))`, envelopeID, recipientID)
	return err
}
