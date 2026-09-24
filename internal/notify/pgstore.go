package notify

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Claim(ctx context.Context) (Job, bool, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Job{}, false, err
	}
	defer tx.Rollback(ctx)

	var job Job
	err = tx.QueryRow(ctx, `
WITH next_job AS (
    SELECT id
    FROM notification_jobs
    WHERE kind IN ('invitation', 'reminder', 'completion')
      AND attempts < $1
      AND (
        (status IN ('pending', 'failed') AND available_at <= now())
        OR (status = 'processing' AND updated_at < now() - interval '2 minutes')
      )
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE notification_jobs AS claimed
SET status = 'processing',
    attempts = claimed.attempts + 1,
    updated_at = now()
FROM next_job
WHERE claimed.id = next_job.id
RETURNING claimed.id::text, claimed.envelope_id::text, claimed.recipient_id::text, claimed.kind, claimed.token_ciphertext, claimed.attempts`, MaxAttempts).Scan(&job.ID, &job.EnvelopeID, &job.RecipientID, &job.Kind, &job.TokenCiphertext, &job.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, false, tx.Commit(ctx)
	}
	if err != nil {
		return Job{}, false, err
	}
	return job, true, tx.Commit(ctx)
}

func (s *PostgresStore) LoadInvitation(ctx context.Context, job Job) (Invitation, error) {
	var value Invitation
	err := s.db.QueryRow(ctx, `
SELECT e.id::text, e.title, e.email_subject, e.email_body, r.id::text, r.name, r.email, r.role::text, r.private_message,
       COALESCE(t.expires_at, now() + interval '30 days'),
       COALESCE(b.config->>'logoDataUrl', ''),
       COALESCE(b.config->>'brandName', ''),
       COALESCE(b.config->>'primaryColor', ''),
       COALESCE((b.config->>'hidePlatformBranding')::boolean, false)
FROM envelopes e
JOIN recipients r ON r.envelope_id = e.id
LEFT JOIN LATERAL (
    SELECT expires_at
    FROM signing_tokens
    WHERE recipient_id = r.id AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
) t ON true
LEFT JOIN organization_settings b ON b.organization_id = e.organization_id AND b.section = 'branding'
WHERE e.id = $1::uuid AND r.id = $2::uuid`, job.EnvelopeID, job.RecipientID).Scan(
		&value.EnvelopeID, &value.EnvelopeTitle, &value.EmailSubject, &value.EmailBody,
		&value.RecipientID, &value.RecipientName, &value.RecipientEmail, &value.RecipientRole, &value.PrivateMessage,
		&value.ExpiresAt,
		&value.Branding.LogoDataURL, &value.Branding.BrandName, &value.Branding.PrimaryColor, &value.Branding.HidePlatformBranding,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Invitation{}, ErrPermanent
	}
	return value, err
}

func (s *PostgresStore) MarkSent(ctx context.Context, job Job, provider, messageID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `UPDATE notification_jobs SET status='sent', last_error=NULL, sent_at=now(), updated_at=now() WHERE id=$1::uuid`, job.ID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO notification_deliveries(job_id, attempt, status, provider, provider_message_id) VALUES($1::uuid,$2,'sent',$3,$4)`, job.ID, job.Attempts, provider, messageID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, metadata) VALUES($1::uuid,$2::uuid,$3,jsonb_build_object('jobId',$4::text,'attempt',$5::int,'provider',$6::text))`, job.EnvelopeID, job.RecipientID, deliveredEvent(job.Kind), job.ID, job.Attempts, provider)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) MarkFailed(ctx context.Context, job Job, err error, retryAt time.Time) error {
	tx, errTx := s.db.Begin(ctx)
	if errTx != nil {
		return errTx
	}
	defer tx.Rollback(ctx)
	message := err.Error()
	_, errTx = tx.Exec(ctx, `UPDATE notification_jobs SET status='failed', last_error=$2, available_at=$3, updated_at=now() WHERE id=$1::uuid`, job.ID, message, retryAt)
	if errTx != nil {
		return errTx
	}
	_, errTx = tx.Exec(ctx, `INSERT INTO notification_deliveries(job_id, attempt, status, provider, error) VALUES($1::uuid,$2,'failed','email',$3)`, job.ID, job.Attempts, message)
	if errTx != nil {
		return errTx
	}
	_, errTx = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, metadata) VALUES($1::uuid,$2::uuid,$3,jsonb_build_object('jobId',$4::text,'attempt',$5::int,'retry',$6::boolean))`, job.EnvelopeID, job.RecipientID, failedEvent(job.Kind), job.ID, job.Attempts, Retryable(err, job.Attempts))
	if errTx != nil {
		return errTx
	}
	return tx.Commit(ctx)
}
