package send

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

type querier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func loadSnapshot(ctx context.Context, q querier, org, envelopeID string) (snapshot, error) {
	var value snapshot
	err := q.QueryRow(ctx, `SELECT id::text, title, status::text FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid`, envelopeID, org).Scan(&value.EnvelopeID, &value.Title, &value.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return snapshot{}, ErrNotFound
	}
	if err != nil {
		return snapshot{}, err
	}

	docs, err := q.Query(ctx, `SELECT id::text, filename, page_count FROM documents WHERE envelope_id=$1::uuid ORDER BY position`, envelopeID)
	if err != nil {
		return snapshot{}, err
	}
	for docs.Next() {
		var document snapshotDocument
		if err := docs.Scan(&document.ID, &document.Filename, &document.PageCount); err != nil {
			docs.Close()
			return snapshot{}, err
		}
		value.Documents = append(value.Documents, document)
	}
	if err := docs.Err(); err != nil {
		docs.Close()
		return snapshot{}, err
	}
	docs.Close()

	recipients, err := q.Query(ctx, `SELECT id::text, name, email, role::text, signing_order FROM recipients WHERE envelope_id=$1::uuid ORDER BY signing_order, created_at`, envelopeID)
	if err != nil {
		return snapshot{}, err
	}
	for recipients.Next() {
		var recipient snapshotRecipient
		if err := recipients.Scan(&recipient.ID, &recipient.Name, &recipient.Email, &recipient.Role, &recipient.SigningOrder); err != nil {
			recipients.Close()
			return snapshot{}, err
		}
		value.Recipients = append(value.Recipients, recipient)
	}
	if err := recipients.Err(); err != nil {
		recipients.Close()
		return snapshot{}, err
	}
	recipients.Close()

	fields, err := q.Query(ctx, `SELECT f.document_id::text, f.recipient_id::text, f.type::text, f.page, f.required FROM document_fields f JOIN documents d ON d.id=f.document_id WHERE d.envelope_id=$1::uuid`, envelopeID)
	if err != nil {
		return snapshot{}, err
	}
	for fields.Next() {
		var field snapshotField
		if err := fields.Scan(&field.DocumentID, &field.RecipientID, &field.Type, &field.Page, &field.Required); err != nil {
			fields.Close()
			return snapshot{}, err
		}
		value.Fields = append(value.Fields, field)
	}
	err = fields.Err()
	fields.Close()
	return value, err
}

func reviewQuery(ctx context.Context, q querier, org, envelopeID string) (Review, error) {
	value, err := loadSnapshot(ctx, q, org, envelopeID)
	if err != nil {
		return Review{}, err
	}
	return evaluate(value), nil
}

func (s *PostgresStore) Review(ctx context.Context, org, envelopeID string) (Review, error) {
	return reviewQuery(ctx, s.db, org, envelopeID)
}

func replaySend(previous []byte) (Result, error) {
	var result Result
	if err := json.Unmarshal(previous, &result); err != nil {
		return Result{}, err
	}
	result.IdempotentReplay = true
	return result, nil
}

func (s *PostgresStore) Send(ctx context.Context, org, userID, envelopeID, key string, generate func() (Token, error)) (Result, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback(ctx)

	var previous []byte
	err = tx.QueryRow(ctx, `SELECT response FROM envelope_operations o JOIN envelopes e ON e.id=o.envelope_id WHERE e.id=$1::uuid AND e.organization_id=$2::uuid AND o.operation='send' AND o.idempotency_key=$3`, envelopeID, org, key).Scan(&previous)
	if err == nil {
		result, err := replaySend(previous)
		if err != nil {
			return Result{}, err
		}
		return result, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Result{}, err
	}

	var status string
	var isTemplate bool
	err = tx.QueryRow(ctx, `SELECT status::text, is_template FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`, envelopeID, org).Scan(&status, &isTemplate)
	if errors.Is(err, pgx.ErrNoRows) {
		return Result{}, ErrNotFound
	}
	if err != nil {
		return Result{}, err
	}
	if isTemplate {
		return Result{}, ErrIsTemplate
	}
	if status != "draft" {
		return Result{}, ErrAlreadySent
	}

	review, err := reviewQuery(ctx, tx, org, envelopeID)
	if err != nil {
		return Result{}, err
	}
	if !review.Ready {
		return Result{}, ErrNotReady
	}

	ids, err := listRecipientIDs(ctx, tx, `
SELECT id::text FROM recipients
WHERE envelope_id=$1::uuid AND role<>'cc'
  AND signing_order = (
    SELECT MIN(signing_order) FROM recipients WHERE envelope_id=$1::uuid AND role<>'cc'
  )
ORDER BY created_at`, envelopeID)
	if err != nil {
		return Result{}, err
	}

	if err := inviteRecipients(ctx, tx, envelopeID, ids, "invitation", true, generate); err != nil {
		return Result{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE envelopes SET status='in_progress', sent_at=now(), updated_at=now() WHERE id=$1::uuid`, envelopeID)
	if err != nil {
		return Result{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, actor_user_id, event_type, metadata) VALUES($1::uuid,$2::uuid,'envelope.sent',jsonb_build_object('invitations',$3::int))`, envelopeID, userID, len(ids))
	if err != nil {
		return Result{}, err
	}

	result := Result{EnvelopeID: envelopeID, Status: "in_progress", InvitationsQueued: len(ids)}
	payload, err := json.Marshal(result)
	if err != nil {
		return Result{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO envelope_operations(envelope_id, idempotency_key, operation, response) VALUES($1::uuid,$2,'send',$3::jsonb)`, envelopeID, key, payload)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			err = tx.QueryRow(ctx, `SELECT response FROM envelope_operations WHERE envelope_id=$1::uuid AND operation='send' AND idempotency_key=$2`, envelopeID, key).Scan(&previous)
			if err != nil {
				return Result{}, err
			}
			return replaySend(previous)
		}
		return Result{}, fmt.Errorf("record idempotency result: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Result{}, err
	}
	return result, nil
}

func (s *PostgresStore) Advance(ctx context.Context, envelopeID string, generate func() (Token, error)) (int, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `SELECT status::text FROM envelopes WHERE id=$1::uuid FOR UPDATE`, envelopeID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if status == "completed" {
		if err := queueCompletion(ctx, tx, envelopeID, generate); err != nil {
			return 0, err
		}
		return 0, tx.Commit(ctx)
	}
	if status != "in_progress" {
		return 0, tx.Commit(ctx)
	}

	ids, err := listRecipientIDs(ctx, tx, `
SELECT r.id::text
FROM recipients r
WHERE r.envelope_id=$1::uuid AND r.role<>'cc' AND r.status='pending'
  AND r.signing_order = (
    SELECT MIN(signing_order)
    FROM recipients
    WHERE envelope_id=$1::uuid AND role IN ('signer','approver') AND status <> 'completed'
  )
ORDER BY created_at`, envelopeID)
	if err != nil {
		return 0, err
	}
	if err := inviteRecipients(ctx, tx, envelopeID, ids, "invitation", true, generate); err != nil {
		return 0, err
	}
	if len(ids) > 0 {
		_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, event_type, metadata) VALUES($1::uuid,'envelope.advanced',jsonb_build_object('invitations',$2::int))`, envelopeID, len(ids))
		if err != nil {
			return 0, err
		}
	}
	return len(ids), tx.Commit(ctx)
}

func (s *PostgresStore) Remind(ctx context.Context, org, userID, envelopeID string, generate func() (Token, error)) (RemindResult, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return RemindResult{}, err
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, `SELECT status::text FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`, envelopeID, org).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return RemindResult{}, ErrNotFound
	}
	if err != nil {
		return RemindResult{}, err
	}
	if status != "in_progress" {
		return RemindResult{}, ErrNotInProgress
	}

	ids, err := listRecipientIDs(ctx, tx, `
SELECT id::text FROM recipients
WHERE envelope_id=$1::uuid AND role<>'cc' AND status IN ('sent','viewed')
ORDER BY signing_order, created_at`, envelopeID)
	if err != nil {
		return RemindResult{}, err
	}
	if len(ids) == 0 {
		return RemindResult{}, ErrNothingToRemind
	}
	if err := inviteRecipients(ctx, tx, envelopeID, ids, "reminder", false, generate); err != nil {
		return RemindResult{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, actor_user_id, event_type, metadata) VALUES($1::uuid,$2::uuid,'envelope.reminded',jsonb_build_object('reminders',$3::int))`, envelopeID, userID, len(ids))
	if err != nil {
		return RemindResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return RemindResult{}, err
	}
	return RemindResult{EnvelopeID: envelopeID, RemindersQueued: len(ids)}, nil
}

func listRecipientIDs(ctx context.Context, q querier, query, envelopeID string) ([]string, error) {
	rows, err := q.Query(ctx, query, envelopeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func inviteRecipients(ctx context.Context, tx pgx.Tx, envelopeID string, ids []string, kind string, markSent bool, generate func() (Token, error)) error {
	expires := time.Now().UTC().Add(30 * 24 * time.Hour)
	for _, recipientID := range ids {
		token, err := generate()
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO signing_tokens(recipient_id, token_hash, expires_at) VALUES($1::uuid,$2,$3)`, recipientID, token.Hash, expires)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO notification_jobs(envelope_id, recipient_id, kind, token_ciphertext) VALUES($1::uuid,$2::uuid,$3,$4)`, envelopeID, recipientID, kind, token.Ciphertext)
		if err != nil {
			return err
		}
		if markSent {
			_, err = tx.Exec(ctx, `UPDATE recipients SET status='sent', sent_at=COALESCE(sent_at, now()), updated_at=now() WHERE id=$1::uuid AND status='pending'`, recipientID)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *PostgresStore) ShareLink(ctx context.Context, org, envelopeID, recipientID string, generate func() (Token, error)) (string, error) {
	token, err := generate()
	if err != nil {
		return "", err
	}
	tag, err := s.db.Exec(ctx, `INSERT INTO signing_tokens(recipient_id,token_hash,expires_at)
SELECT r.id,$4,now()+interval '30 days' FROM recipients r JOIN envelopes e ON e.id=r.envelope_id
WHERE r.id=$1::uuid AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status IN ('in_progress','completed')`, recipientID, envelopeID, org, token.Hash)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		return "", ErrNotFound
	}
	return token.Raw, nil
}

func queueCompletion(ctx context.Context, tx pgx.Tx, envelopeID string, generate func() (Token, error)) error {
	ids, err := listRecipientIDs(ctx, tx, `SELECT r.id::text FROM recipients r WHERE r.envelope_id=$1::uuid AND NOT EXISTS (
SELECT 1 FROM notification_jobs j WHERE j.envelope_id=r.envelope_id AND j.recipient_id=r.id AND j.kind='completion') ORDER BY r.created_at`, envelopeID)
	if err != nil {
		return err
	}
	return inviteRecipients(ctx, tx, envelopeID, ids, "completion", false, generate)
}
