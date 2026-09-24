package finalize

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) EnvelopeCompleted(ctx context.Context, envelopeID string) (bool, error) {
	var ok bool
	err := s.db.QueryRow(ctx, `SELECT status='completed' FROM envelopes WHERE id=$1::uuid`, envelopeID).Scan(&ok)
	return ok, err
}

func (s *PostgresStore) Documents(ctx context.Context, envelopeID string) ([]storedDocument, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text, object_key, COALESCE(completed_object_key,'') FROM documents WHERE envelope_id=$1::uuid ORDER BY position`, envelopeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []storedDocument{}
	for rows.Next() {
		var document storedDocument
		if err := rows.Scan(&document.ID, &document.ObjectKey, &document.CompletedObjectKey); err != nil {
			return nil, err
		}
		values = append(values, document)
	}
	return values, rows.Err()
}

func (s *PostgresStore) Appearances(ctx context.Context, envelopeID string) ([]appearance, error) {
	rows, err := s.db.Query(ctx, `
SELECT f.document_id::text, f.page, f.x::float8, f.y::float8, f.width::float8, f.height::float8, f.type::text, f.value, r.name
FROM document_fields f
JOIN documents d ON d.id = f.document_id
JOIN recipients r ON r.id = f.recipient_id
WHERE d.envelope_id=$1::uuid AND f.value IS NOT NULL`, envelopeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []appearance{}
	for rows.Next() {
		var field appearance
		if err := rows.Scan(&field.DocumentID, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Type, &field.Value, &field.SignerName); err != nil {
			return nil, err
		}
		if len(field.Value) == 0 || string(field.Value) == "null" {
			field.Value = json.RawMessage(`{}`)
		}
		values = append(values, field)
	}
	return values, rows.Err()
}

func (s *PostgresStore) SaveCompleted(ctx context.Context, documentID, key, hash string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
UPDATE documents SET completed_object_key=$2, completed_sha256=$3, completed_at=COALESCE(completed_at, now())
WHERE id=$1::uuid`, documentID, key, hash)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
INSERT INTO audit_events(envelope_id, event_type, metadata)
SELECT envelope_id, 'document.finalized', jsonb_build_object('documentId', $1::text, 'sha256', $2::text)
FROM documents WHERE id = $3::uuid`, documentID, hash, documentID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
