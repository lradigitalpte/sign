package signing

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Resolve(ctx context.Context, tokenHash []byte) (Session, error) {
	var session Session
	err := s.db.QueryRow(ctx, `
SELECT e.id::text, e.title, e.status::text, e.language, e.expires_at,
       r.id::text, r.name, r.email, r.role::text, r.status::text, r.private_message,
       o.name,
       COALESCE(b.config->>'logoDataUrl', ''),
       COALESCE(b.config->>'brandName', ''),
       COALESCE(b.config->>'primaryColor', ''),
       COALESCE((b.config->>'hidePlatformBranding')::boolean, false)
FROM signing_tokens t
JOIN recipients r ON r.id = t.recipient_id
JOIN envelopes e ON e.id = r.envelope_id
JOIN organizations o ON o.id = e.organization_id
LEFT JOIN organization_settings b ON b.organization_id = e.organization_id AND b.section = 'branding'
WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()`, tokenHash).Scan(
		&session.Envelope.ID, &session.Envelope.Title, &session.Envelope.Status, &session.Envelope.Language, &session.Envelope.ExpiresAt,
		&session.Recipient.ID, &session.Recipient.Name, &session.Recipient.Email, &session.Recipient.Role, &session.Recipient.Status, &session.Recipient.PrivateMessage,
		&session.OrganizationName,
		&session.OrganizationBrand.LogoDataURL, &session.OrganizationBrand.BrandName, &session.OrganizationBrand.PrimaryColor, &session.OrganizationBrand.HidePlatformBranding,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrInvalidToken
	}
	if err != nil {
		return Session{}, err
	}
	_, _ = s.db.Exec(ctx, `UPDATE signing_tokens SET last_used_at=now() WHERE token_hash=$1`, tokenHash)

	docs, err := s.db.Query(ctx, `SELECT id::text, filename, page_count FROM documents WHERE envelope_id=$1::uuid ORDER BY position`, session.Envelope.ID)
	if err != nil {
		return Session{}, err
	}
	defer docs.Close()
	session.Documents = []Document{}
	for docs.Next() {
		var document Document
		if err := docs.Scan(&document.ID, &document.Filename, &document.PageCount); err != nil {
			return Session{}, err
		}
		session.Documents = append(session.Documents, document)
	}
	if err := docs.Err(); err != nil {
		return Session{}, err
	}

	fields, err := s.db.Query(ctx, `
SELECT f.id::text, f.document_id::text, f.recipient_id::text, f.type::text, f.page, f.x::float8, f.y::float8, f.width::float8, f.height::float8, f.label, f.required, f.options, f.value, f.completed_at
FROM document_fields f
JOIN documents d ON d.id = f.document_id
WHERE d.envelope_id=$1::uuid
ORDER BY d.position, f.page, f.created_at`, session.Envelope.ID)
	if err != nil {
		return Session{}, err
	}
	defer fields.Close()
	session.Fields = []Field{}
	for fields.Next() {
		var field Field
		var completedAt *time.Time
		if err := fields.Scan(&field.ID, &field.DocumentID, &field.RecipientID, &field.Type, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Label, &field.Required, &field.Options, &field.Value, &completedAt); err != nil {
			return Session{}, err
		}
		field.Completed = completedAt != nil || len(field.Value) > 0
		session.Fields = append(session.Fields, field)
	}
	if err := fields.Err(); err != nil {
		return Session{}, err
	}

	attachmentRows, err := s.db.Query(ctx, `
SELECT id::text, kind, label, url, filename, mime_type, position
FROM envelope_attachments
WHERE envelope_id=$1::uuid
ORDER BY position, created_at`, session.Envelope.ID)
	if err != nil {
		return Session{}, err
	}
	defer attachmentRows.Close()
	session.Attachments = []Attachment{}
	for attachmentRows.Next() {
		var item Attachment
		if err := attachmentRows.Scan(&item.ID, &item.Kind, &item.Label, &item.URL, &item.Filename, &item.MimeType, &item.Position); err != nil {
			return Session{}, err
		}
		session.Attachments = append(session.Attachments, item)
	}
	if err := attachmentRows.Err(); err != nil {
		return Session{}, err
	}

	return session, nil
}

func (s *PostgresStore) MarkViewed(ctx context.Context, recipientID string, audit AuditContext) error {
	tag, err := s.db.Exec(ctx, `UPDATE recipients SET status='viewed', viewed_at=COALESCE(viewed_at, now()), updated_at=now() WHERE id=$1::uuid AND status IN ('sent','viewed')`, recipientID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	_, err = s.db.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, ip_address, user_agent)
SELECT envelope_id, id, 'envelope.viewed', NULLIF($2,'')::inet, $3 FROM recipients WHERE id=$1::uuid`, recipientID, nullableInet(audit.IP), audit.UserAgent)
	return err
}

func (s *PostgresStore) SaveField(ctx context.Context, recipientID, fieldID string, value json.RawMessage, placement *FieldPlacement) (Field, error) {
	var field Field
	var completedAt *time.Time
	page := (*int)(nil)
	x, y, width, height := (*float64)(nil), (*float64)(nil), (*float64)(nil), (*float64)(nil)
	if placement != nil {
		page = placement.Page
		x = placement.X
		y = placement.Y
		width = placement.Width
		height = placement.Height
		if page != nil && *page < 1 {
			return Field{}, errors.New("invalid field page")
		}
		if x != nil && (*x < 0 || *x > 100) {
			return Field{}, errors.New("invalid field x")
		}
		if y != nil && (*y < 0 || *y > 100) {
			return Field{}, errors.New("invalid field y")
		}
		if width != nil && (*width <= 0 || *width > 100) {
			return Field{}, errors.New("invalid field width")
		}
		if height != nil && (*height <= 0 || *height > 100) {
			return Field{}, errors.New("invalid field height")
		}
		if x != nil && width != nil && *x+*width > 100 {
			return Field{}, errors.New("field extends past page width")
		}
		if y != nil && height != nil && *y+*height > 100 {
			return Field{}, errors.New("field extends past page height")
		}
	}
	err := s.db.QueryRow(ctx, `
UPDATE document_fields f SET value=$3::jsonb, completed_at=now(), updated_at=now(),
  page=COALESCE($4, f.page),
  x=COALESCE($5::numeric, f.x),
  y=COALESCE($6::numeric, f.y),
  width=COALESCE($7::numeric, f.width),
  height=COALESCE($8::numeric, f.height)
FROM documents d, envelopes e, recipients r
WHERE f.id=$1::uuid AND f.recipient_id=$2::uuid AND d.id=f.document_id AND e.id=d.envelope_id AND r.id=f.recipient_id
  AND e.status='in_progress' AND r.status IN ('sent','viewed')
  AND COALESCE($4, f.page) <= d.page_count
RETURNING f.id::text, f.document_id::text, f.type::text, f.page, f.x::float8, f.y::float8, f.width::float8, f.height::float8, f.label, f.required, f.value, f.completed_at`, fieldID, recipientID, value, page, x, y, width, height).Scan(
		&field.ID, &field.DocumentID, &field.Type, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Label, &field.Required, &field.Value, &completedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Field{}, ErrUnavailable
	}
	field.Completed = true
	return field, err
}

func (s *PostgresStore) UpdateFieldPlacement(ctx context.Context, recipientID, fieldID string, placement FieldGeometry) (Field, error) {
	if placement.Page < 1 || placement.X < 0 || placement.Y < 0 || placement.Width <= 0 || placement.Height <= 0 || placement.X+placement.Width > 100 || placement.Y+placement.Height > 100 {
		return Field{}, errors.New("invalid field placement")
	}
	var field Field
	var completedAt *time.Time
	err := s.db.QueryRow(ctx, `
UPDATE document_fields f SET page=$3, x=$4::numeric, y=$5::numeric, width=$6::numeric, height=$7::numeric, updated_at=now()
FROM documents d, envelopes e, recipients r
WHERE f.id=$1::uuid AND f.recipient_id=$2::uuid AND d.id=f.document_id AND e.id=d.envelope_id AND r.id=f.recipient_id
  AND e.status='in_progress' AND r.status IN ('sent','viewed') AND $3 <= d.page_count
RETURNING f.id::text, f.document_id::text, f.type::text, f.page, f.x::float8, f.y::float8, f.width::float8, f.height::float8, f.label, f.required, f.value, f.completed_at`,
		fieldID, recipientID, placement.Page, placement.X, placement.Y, placement.Width, placement.Height).Scan(
		&field.ID, &field.DocumentID, &field.Type, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Label, &field.Required, &field.Value, &completedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Field{}, ErrUnavailable
	}
	field.Completed = completedAt != nil || len(field.Value) > 0
	return field, err
}

func (s *PostgresStore) CreateField(ctx context.Context, recipientID string, input FieldCreateInput) (Field, error) {
	if input.Width <= 0 || input.Height <= 0 || input.X+input.Width > 100 || input.Y+input.Height > 100 {
		return Field{}, errors.New("invalid field placement")
	}
	var field Field
	var completedAt *time.Time
	label := input.Label
	err := s.db.QueryRow(ctx, `
INSERT INTO document_fields(document_id, recipient_id, type, page, x, y, width, height, label, required)
SELECT d.id, r.id, $3::field_type, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric, NULLIF($9,''), true
FROM documents d
JOIN envelopes e ON e.id = d.envelope_id
JOIN recipients r ON r.envelope_id = e.id AND r.id = $2::uuid
WHERE d.id = $1::uuid AND e.status = 'in_progress' AND r.status IN ('sent','viewed') AND $4 <= d.page_count
RETURNING id::text, document_id::text, type::text, page, x::float8, y::float8, width::float8, height::float8, label, required, value, completed_at`,
		input.DocumentID, recipientID, input.Type, input.Page, input.X, input.Y, input.Width, input.Height, label).Scan(
		&field.ID, &field.DocumentID, &field.Type, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Label, &field.Required, &field.Value, &completedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Field{}, ErrUnavailable
	}
	field.Completed = completedAt != nil || len(field.Value) > 0
	return field, err
}

func (s *PostgresStore) DeleteField(ctx context.Context, recipientID, fieldID string) error {
	tag, err := s.db.Exec(ctx, `
DELETE FROM document_fields f
USING documents d, envelopes e, recipients r
WHERE f.id=$1::uuid AND f.recipient_id=$2::uuid AND d.id=f.document_id AND e.id=d.envelope_id AND r.id=f.recipient_id
  AND e.status='in_progress' AND r.status IN ('sent','viewed')`, fieldID, recipientID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUnavailable
	}
	return nil
}

func (s *PostgresStore) Complete(ctx context.Context, recipientID string, audit AuditContext) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var envelopeID string
	var role string
	err = tx.QueryRow(ctx, `
UPDATE recipients SET status='completed', completed_at=now(), updated_at=now()
WHERE id=$1::uuid AND status IN ('sent','viewed')
RETURNING envelope_id::text, role::text`, recipientID).Scan(&envelopeID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAlreadyFinished
	}
	if err != nil {
		return err
	}
	eventType := "recipient.completed"
	if role == "approver" {
		eventType = "recipient.approved"
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, ip_address, user_agent, metadata)
VALUES ($1::uuid,$2::uuid,$3,NULLIF($4,'')::inet,$5,'{}'::jsonb)`, envelopeID, recipientID, eventType, nullableInet(audit.IP), audit.UserAgent)
	if err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
UPDATE envelopes SET status='completed', completed_at=now(), updated_at=now()
WHERE id=$1::uuid AND status='in_progress'
  AND NOT EXISTS (
    SELECT 1 FROM recipients WHERE envelope_id=$1::uuid AND role IN ('signer','approver') AND status <> 'completed'
  )`, envelopeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, event_type, metadata) VALUES ($1::uuid,'envelope.completed','{}'::jsonb)`, envelopeID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) Decline(ctx context.Context, recipientID, reason string, audit AuditContext) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var envelopeID string
	err = tx.QueryRow(ctx, `
UPDATE recipients SET status='declined', declined_at=now(), decline_reason=$2, updated_at=now()
WHERE id=$1::uuid AND status IN ('sent','viewed')
RETURNING envelope_id::text`, recipientID, reason).Scan(&envelopeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAlreadyFinished
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE signing_tokens SET revoked_at=now() WHERE recipient_id=$1::uuid AND revoked_at IS NULL`, recipientID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, recipient_id, event_type, ip_address, user_agent, metadata)
VALUES ($1::uuid,$2::uuid,'recipient.declined',NULLIF($3,'')::inet,$4,jsonb_build_object('reason',$5))`, envelopeID, recipientID, nullableInet(audit.IP), audit.UserAgent, reason)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE envelopes SET status='voided', updated_at=now() WHERE id=$1::uuid AND status='in_progress'`, envelopeID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) Document(ctx context.Context, envelopeID, documentID string) (StoredDocument, error) {
	var document StoredDocument
	err := s.db.QueryRow(ctx, `SELECT d.id::text,
CASE WHEN e.status='completed' AND d.completed_object_key IS NOT NULL THEN regexp_replace(d.filename, '(?i)\.pdf$', '') || '-signed.pdf' ELSE d.filename END,
CASE WHEN e.status='completed' AND d.completed_object_key IS NOT NULL THEN d.completed_object_key ELSE d.object_key END
FROM documents d JOIN envelopes e ON e.id=d.envelope_id
WHERE d.id=$1::uuid AND d.envelope_id=$2::uuid`, documentID, envelopeID).Scan(&document.ID, &document.Filename, &document.ObjectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return StoredDocument{}, ErrInvalidToken
	}
	return document, err
}

func (s *PostgresStore) AttachmentFile(ctx context.Context, envelopeID, attachmentID string) (string, string, string, error) {
	var objectKey, filename, mimeType string
	err := s.db.QueryRow(ctx, `
SELECT object_key, filename, mime_type
FROM envelope_attachments
WHERE id=$1::uuid AND envelope_id=$2::uuid AND kind='file'`, attachmentID, envelopeID).Scan(&objectKey, &filename, &mimeType)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", ErrInvalidToken
	}
	return objectKey, filename, mimeType, err
}

func (s *PostgresStore) FieldContext(ctx context.Context, recipientID, fieldID string) (string, string, string, error) {
	var fieldType, envelopeID, orgID string
	err := s.db.QueryRow(ctx, `
SELECT f.type::text, e.id::text, e.organization_id::text
FROM document_fields f
JOIN documents d ON d.id=f.document_id
JOIN envelopes e ON e.id=d.envelope_id
WHERE f.id=$1::uuid AND f.recipient_id=$2::uuid
  AND e.status='in_progress'`, fieldID, recipientID).Scan(&fieldType, &envelopeID, &orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", ErrUnavailable
	}
	return fieldType, envelopeID, orgID, err
}

func nullableInet(value string) any {
	if net.ParseIP(value) == nil {
		return nil
	}
	return value
}
