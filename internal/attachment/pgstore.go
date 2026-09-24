package attachment

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

const cols = `a.id::text,a.envelope_id::text,a.kind,a.label,a.url,a.filename,a.mime_type,a.size_bytes,a.sha256,a.position,a.created_at,a.updated_at`
const returnCols = `id::text,envelope_id::text,kind,label,url,filename,mime_type,size_bytes,sha256,position,created_at,updated_at`
const storedCols = cols + `,a.object_key`

const editableStatus = `e.status IN ('draft','in_progress')`

func scan(row pgx.Row) (Attachment, error) {
	var value Attachment
	err := row.Scan(&value.ID, &value.EnvelopeID, &value.Kind, &value.Label, &value.URL, &value.Filename, &value.MimeType, &value.SizeBytes, &value.SHA256, &value.Position, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Attachment{}, ErrNotFound
	}
	return value, err
}

func scanStored(row pgx.Row) (StoredAttachment, error) {
	var value StoredAttachment
	err := row.Scan(&value.ID, &value.EnvelopeID, &value.Kind, &value.Label, &value.URL, &value.Filename, &value.MimeType, &value.SizeBytes, &value.SHA256, &value.Position, &value.CreatedAt, &value.UpdatedAt, &value.ObjectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return StoredAttachment{}, ErrNotFound
	}
	return value, err
}

func (s *PostgresStore) List(ctx context.Context, org, envelopeID string) ([]Attachment, error) {
	rows, err := s.db.Query(ctx, `SELECT `+cols+` FROM envelope_attachments a JOIN envelopes e ON e.id=a.envelope_id WHERE a.envelope_id=$1::uuid AND e.organization_id=$2::uuid ORDER BY a.position,a.created_at`, envelopeID, org)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Attachment{}
	for rows.Next() {
		value, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, rows.Err()
}

func (s *PostgresStore) Get(ctx context.Context, org, envelopeID, id string) (StoredAttachment, error) {
	return scanStored(s.db.QueryRow(ctx, `
SELECT `+storedCols+`
FROM envelope_attachments a
JOIN envelopes e ON e.id=a.envelope_id
WHERE a.id=$1::uuid AND a.envelope_id=$2::uuid AND e.organization_id=$3::uuid`, id, envelopeID, org))
}

func (s *PostgresStore) nextPosition(ctx context.Context, org, envelopeID string) (int, error) {
	var position int
	err := s.db.QueryRow(ctx, `
SELECT COALESCE(max(a.position)+1,0) FROM envelope_attachments a
JOIN envelopes e ON e.id=a.envelope_id
WHERE a.envelope_id=$1::uuid AND e.organization_id=$2::uuid`, envelopeID, org).Scan(&position)
	return position, err
}

func (s *PostgresStore) CreateLink(ctx context.Context, org, envelopeID string, input CreateLinkInput) (Attachment, error) {
	position := input.Position
	if position == 0 {
		var err error
		position, err = s.nextPosition(ctx, org, envelopeID)
		if err != nil {
			return Attachment{}, err
		}
	}
	return scan(s.db.QueryRow(ctx, `
INSERT INTO envelope_attachments(envelope_id,kind,label,url,position)
SELECT e.id,'link',$3,$4,$5 FROM envelopes e
WHERE e.id=$1::uuid AND e.organization_id=$2::uuid AND `+editableStatus+`
RETURNING `+returnCols, envelopeID, org, input.Label, input.URL, position))
}

func (s *PostgresStore) CreateFile(ctx context.Context, org, envelopeID, label, filename, mimeType string, size int64, objectKey, sha256 string, position int) (Attachment, error) {
	if position == 0 {
		var err error
		position, err = s.nextPosition(ctx, org, envelopeID)
		if err != nil {
			return Attachment{}, err
		}
	}
	return scan(s.db.QueryRow(ctx, `
INSERT INTO envelope_attachments(envelope_id,kind,label,object_key,filename,mime_type,size_bytes,sha256,position)
SELECT e.id,'file',$3,$4,$5,$6,$7,$8,$9 FROM envelopes e
WHERE e.id=$1::uuid AND e.organization_id=$2::uuid AND `+editableStatus+`
RETURNING `+returnCols, envelopeID, org, label, objectKey, filename, mimeType, size, sha256, position))
}

func (s *PostgresStore) Update(ctx context.Context, org, envelopeID, id string, input UpdateInput) (Attachment, error) {
	return scan(s.db.QueryRow(ctx, `
UPDATE envelope_attachments a SET
	label=COALESCE($4,label),
	url=CASE WHEN a.kind='link' THEN COALESCE($5,url) ELSE a.url END,
	position=COALESCE($6,position),
	updated_at=now()
FROM envelopes e
WHERE a.id=$1::uuid AND a.envelope_id=e.id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND `+editableStatus+`
RETURNING `+cols, id, envelopeID, org, input.Label, input.URL, input.Position))
}

func (s *PostgresStore) Delete(ctx context.Context, org, envelopeID, id string) (*string, error) {
	var objectKey *string
	err := s.db.QueryRow(ctx, `
DELETE FROM envelope_attachments a
USING envelopes e
WHERE a.id=$1::uuid AND a.envelope_id=e.id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND `+editableStatus+`
RETURNING a.object_key`, id, envelopeID, org).Scan(&objectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return objectKey, err
}
