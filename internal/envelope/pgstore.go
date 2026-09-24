package envelope

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

const columns = `id::text, organization_id::text, created_by::text, title, status::text, language, timezone, date_format, allowed_signature_types, distribution_method, external_id, redirect_url, email_subject, email_body, folder_id::text, auto_reminders, first_reminder_days, repeat_reminder_days, notify_on_view, notify_on_sign, attach_completed_pdf, session_timeout_minutes, require_passcode, expires_at, is_template, created_at, updated_at`

const detailedColumns = `e.id::text, e.organization_id::text, e.created_by::text, e.title, e.status::text, e.language, e.timezone, e.date_format, e.allowed_signature_types, e.distribution_method, e.external_id, e.redirect_url, e.email_subject, e.email_body, e.folder_id::text, e.auto_reminders, e.first_reminder_days, e.repeat_reminder_days, e.notify_on_view, e.notify_on_sign, e.attach_completed_pdf, e.session_timeout_minutes, e.require_passcode, e.expires_at, e.is_template, e.created_at, e.updated_at, u.name, u.email, COALESCE((SELECT json_agg(json_build_object('id', r.id::text, 'name', r.name, 'email', r.email, 'role', r.role::text, 'status', r.status::text, 'signingOrder', r.signing_order) ORDER BY r.signing_order, r.created_at) FROM recipients r WHERE r.envelope_id = e.id), '[]'::json)`

func scan(row pgx.Row) (Envelope, error) {
	var value Envelope
	err := row.Scan(
		&value.ID,
		&value.OrganizationID,
		&value.CreatedBy,
		&value.Title,
		&value.Status,
		&value.Language,
		&value.Timezone,
		&value.DateFormat,
		&value.AllowedSignatureTypes,
		&value.DistributionMethod,
		&value.ExternalID,
		&value.RedirectURL,
		&value.EmailSubject,
		&value.EmailBody,
		&value.FolderID,
		&value.AutoReminders,
		&value.FirstReminderDays,
		&value.RepeatReminderDays,
		&value.NotifyOnView,
		&value.NotifyOnSign,
		&value.AttachCompletedPDF,
		&value.SessionTimeoutMinutes,
		&value.RequirePasscode,
		&value.ExpiresAt,
		&value.IsTemplate,
		&value.CreatedAt,
		&value.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Envelope{}, ErrNotFound
	}
	return value, err
}

func scanDetailed(row pgx.Row) (Envelope, error) {
	var value Envelope
	var recipientsRaw []byte
	err := row.Scan(
		&value.ID,
		&value.OrganizationID,
		&value.CreatedBy,
		&value.Title,
		&value.Status,
		&value.Language,
		&value.Timezone,
		&value.DateFormat,
		&value.AllowedSignatureTypes,
		&value.DistributionMethod,
		&value.ExternalID,
		&value.RedirectURL,
		&value.EmailSubject,
		&value.EmailBody,
		&value.FolderID,
		&value.AutoReminders,
		&value.FirstReminderDays,
		&value.RepeatReminderDays,
		&value.NotifyOnView,
		&value.NotifyOnSign,
		&value.AttachCompletedPDF,
		&value.SessionTimeoutMinutes,
		&value.RequirePasscode,
		&value.ExpiresAt,
		&value.IsTemplate,
		&value.CreatedAt,
		&value.UpdatedAt,
		&value.SenderName,
		&value.SenderEmail,
		&recipientsRaw,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Envelope{}, ErrNotFound
	}
	if err != nil {
		return Envelope{}, err
	}
	if len(recipientsRaw) > 0 {
		var recs []RecipientSummary
		if err := json.Unmarshal(recipientsRaw, &recs); err == nil {
			value.Recipients = recs
		}
	}
	if value.Recipients == nil {
		value.Recipients = []RecipientSummary{}
	}
	return value, nil
}

func (s *PostgresStore) Create(ctx context.Context, organizationID, userID string, input CreateInput) (Envelope, error) {
	return scan(s.db.QueryRow(ctx, `INSERT INTO envelopes (organization_id, created_by, title, language, timezone, date_format, expires_at, is_template)
VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) RETURNING `+columns, organizationID, userID, input.Title, input.Language, input.Timezone, input.DateFormat, input.ExpiresAt, input.IsTemplate))
}

func (s *PostgresStore) List(ctx context.Context, organizationID string, filter ListFilter) ([]Envelope, error) {
	rows, err := s.db.Query(ctx, `
SELECT `+detailedColumns+`
FROM envelopes e
LEFT JOIN users u ON u.id = e.created_by
WHERE e.organization_id=$1::uuid
  AND ($2='' OR e.status::text=$2)
  AND (
    $3='' OR
    ($3='none' AND e.folder_id IS NULL) OR
    ($3<>'none' AND e.folder_id=$3::uuid)
  )
  AND e.is_template = COALESCE($4, false)
ORDER BY e.updated_at DESC, e.id DESC`, organizationID, filter.Status, filter.FolderID, filter.IsTemplate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]Envelope, 0)
	for rows.Next() {
		value, err := scanDetailed(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *PostgresStore) Get(ctx context.Context, organizationID, id string) (Envelope, error) {
	return scanDetailed(s.db.QueryRow(ctx, `SELECT `+detailedColumns+` FROM envelopes e LEFT JOIN users u ON u.id = e.created_by WHERE e.id=$1::uuid AND e.organization_id=$2::uuid`, id, organizationID))
}

func (s *PostgresStore) Update(ctx context.Context, organizationID, id string, input UpdateInput) (Envelope, error) {
	value, err := scan(s.db.QueryRow(ctx, `UPDATE envelopes SET
		title=COALESCE($3,title),
		language=COALESCE($4,language),
		timezone=COALESCE($5,timezone),
		date_format=COALESCE($6,date_format),
		allowed_signature_types=COALESCE($7,allowed_signature_types),
		distribution_method=COALESCE($8,distribution_method),
		external_id=COALESCE($9,external_id),
		redirect_url=COALESCE($10,redirect_url),
		email_subject=COALESCE($11,email_subject),
		email_body=COALESCE($12,email_body),
		auto_reminders=COALESCE($13,auto_reminders),
		first_reminder_days=COALESCE($14,first_reminder_days),
		repeat_reminder_days=COALESCE($15,repeat_reminder_days),
		notify_on_view=COALESCE($16,notify_on_view),
		notify_on_sign=COALESCE($17,notify_on_sign),
		attach_completed_pdf=COALESCE($18,attach_completed_pdf),
		session_timeout_minutes=COALESCE($19,session_timeout_minutes),
		require_passcode=COALESCE($20,require_passcode),
		passcode=COALESCE($21,passcode),
		expires_at=COALESCE($22,expires_at),
		updated_at=now()
	WHERE id=$1::uuid AND organization_id=$2::uuid AND status='draft'
	RETURNING `+columns,
		id, organizationID, input.Title, input.Language, input.Timezone, input.DateFormat,
		input.AllowedSignatureTypes, input.DistributionMethod, input.ExternalID, input.RedirectURL, input.EmailSubject, input.EmailBody,
		input.AutoReminders, input.FirstReminderDays, input.RepeatReminderDays, input.NotifyOnView, input.NotifyOnSign,
		input.AttachCompletedPDF, input.SessionTimeoutMinutes, input.RequirePasscode, input.Passcode, input.ExpiresAt))
	if errors.Is(err, ErrNotFound) {
		if _, getErr := s.Get(ctx, organizationID, id); getErr != nil {
			return Envelope{}, getErr
		}
		return Envelope{}, ErrNotEditable
	}
	return value, err
}

func (s *PostgresStore) MoveToFolder(ctx context.Context, organizationID, id string, folderID *string) (Envelope, error) {
	if folderID != nil {
		var exists bool
		err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND organization_id=$2::uuid)`, *folderID, organizationID).Scan(&exists)
		if err != nil {
			return Envelope{}, err
		}
		if !exists {
			return Envelope{}, ErrNotFound
		}
	}
	value, err := scan(s.db.QueryRow(ctx, `
UPDATE envelopes SET folder_id=$3::uuid, updated_at=now()
WHERE id=$1::uuid AND organization_id=$2::uuid
RETURNING `+columns, id, organizationID, folderID))
	return value, err
}

func (s *PostgresStore) Delete(ctx context.Context, organizationID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid AND status='draft'`, id, organizationID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, getErr := s.Get(ctx, organizationID, id); getErr != nil {
			return getErr
		}
		return ErrNotEditable
	}
	return nil
}

func (s *PostgresStore) Void(ctx context.Context, organizationID, userID, id string) (Envelope, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Envelope{}, err
	}
	defer tx.Rollback(ctx)
	value, err := scan(tx.QueryRow(ctx, `UPDATE envelopes SET status='voided', updated_at=now() WHERE id=$1::uuid AND organization_id=$2::uuid AND status='in_progress' RETURNING `+columns, id, organizationID))
	if errors.Is(err, ErrNotFound) {
		if _, getErr := s.Get(ctx, organizationID, id); getErr != nil {
			return Envelope{}, getErr
		}
		return Envelope{}, ErrNotEditable
	}
	if err != nil {
		return Envelope{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE signing_tokens t SET revoked_at=now() FROM recipients r WHERE r.id=t.recipient_id AND r.envelope_id=$1::uuid AND t.revoked_at IS NULL`, id)
	if err != nil {
		return Envelope{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, actor_user_id, event_type) VALUES ($1::uuid,$2::uuid,'envelope.voided')`, id, userID)
	if err != nil {
		return Envelope{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Envelope{}, err
	}
	return value, nil
}

func (s *PostgresStore) ListAudit(ctx context.Context, organizationID, id string) ([]AuditEvent, error) {
	rows, err := s.db.Query(ctx, `
SELECT a.id::text, a.event_type, u.name, r.name, host(a.ip_address), a.user_agent, a.metadata, a.occurred_at
FROM audit_events a
JOIN envelopes e ON e.id = a.envelope_id
LEFT JOIN users u ON u.id = a.actor_user_id
LEFT JOIN recipients r ON r.id = a.recipient_id
WHERE a.envelope_id=$1::uuid AND e.organization_id=$2::uuid
ORDER BY a.occurred_at, a.id`, id, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []AuditEvent{}
	for rows.Next() {
		var event AuditEvent
		if err := rows.Scan(&event.ID, &event.EventType, &event.ActorName, &event.RecipientName, &event.IPAddress, &event.UserAgent, &event.Metadata, &event.OccurredAt); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (s *PostgresStore) BulkMoveToFolder(ctx context.Context, organizationID string, envelopeIDs []string, folderID *string) (int64, error) {
	if len(envelopeIDs) == 0 {
		return 0, nil
	}
	if folderID != nil {
		var exists bool
		err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND organization_id=$2::uuid)`, *folderID, organizationID).Scan(&exists)
		if err != nil {
			return 0, err
		}
		if !exists {
			return 0, ErrNotFound
		}
	}
	tag, err := s.db.Exec(ctx, `
UPDATE envelopes SET folder_id=$3::uuid, updated_at=now()
WHERE organization_id=$1::uuid AND id=ANY($2::uuid[])`, organizationID, envelopeIDs, folderID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *PostgresStore) BulkDelete(ctx context.Context, organizationID string, envelopeIDs []string) (int64, error) {
	if len(envelopeIDs) == 0 {
		return 0, nil
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM envelopes WHERE organization_id=$1::uuid AND id=ANY($2::uuid[]) AND status='draft'`, organizationID, envelopeIDs)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *PostgresStore) BulkVoid(ctx context.Context, organizationID, userID string, envelopeIDs []string) (int64, error) {
	if len(envelopeIDs) == 0 {
		return 0, nil
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `UPDATE envelopes SET status='voided', updated_at=now() WHERE organization_id=$1::uuid AND id=ANY($2::uuid[]) AND status='in_progress'`, organizationID, envelopeIDs)
	if err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `UPDATE signing_tokens t SET revoked_at=now() FROM recipients r WHERE r.id=t.recipient_id AND r.envelope_id=ANY($1::uuid[]) AND t.revoked_at IS NULL`, envelopeIDs)
	if err != nil {
		return 0, err
	}
	for _, id := range envelopeIDs {
		_, _ = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, actor_user_id, event_type) VALUES ($1::uuid,$2::uuid,'envelope.voided')`, id, userID)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

