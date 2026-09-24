package document

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }
func (s *PostgresStore) Create(ctx context.Context, org, envelopeID, filename string, size int64, pageCount int, key, hash string) (Document, error) {
	var d Document
	err := s.db.QueryRow(ctx, `INSERT INTO documents(envelope_id,position,filename,object_key,mime_type,size_bytes,page_count,sha256)
SELECT e.id,COALESCE((SELECT max(position)+1 FROM documents WHERE envelope_id=e.id),0),$3,$4,'application/pdf',$5,$6,$7 FROM envelopes e WHERE e.id=$1::uuid AND e.organization_id=$2::uuid AND e.status='draft'
RETURNING id::text,envelope_id::text,position,filename,mime_type,size_bytes,page_count,sha256,created_at`, envelopeID, org, filename, key, size, pageCount, hash).Scan(&d.ID, &d.EnvelopeID, &d.Position, &d.Filename, &d.MimeType, &d.SizeBytes, &d.PageCount, &d.SHA256, &d.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Document{}, ErrNotFound
	}
	return d, err
}
func (s *PostgresStore) List(ctx context.Context, org, envelopeID string) ([]Document, error) {
	rows, err := s.db.Query(ctx, `SELECT d.id::text,d.envelope_id::text,d.position,d.filename,d.mime_type,d.size_bytes,d.page_count,d.sha256,d.completed_sha256,d.created_at FROM documents d JOIN envelopes e ON e.id=d.envelope_id WHERE e.id=$1::uuid AND e.organization_id=$2::uuid ORDER BY d.position`, envelopeID, org)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Document{}
	for rows.Next() {
		var d Document
		if err := rows.Scan(&d.ID, &d.EnvelopeID, &d.Position, &d.Filename, &d.MimeType, &d.SizeBytes, &d.PageCount, &d.SHA256, &d.CompletedSHA256, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func (s *PostgresStore) Get(ctx context.Context, org, envelopeID, id string) (StoredDocument, error) {
	var d StoredDocument
	err := s.db.QueryRow(ctx, `SELECT d.id::text,d.envelope_id::text,d.position,d.filename,d.mime_type,d.size_bytes,d.page_count,d.sha256,d.completed_sha256,d.created_at,d.object_key,COALESCE(d.completed_object_key,'') FROM documents d JOIN envelopes e ON e.id=d.envelope_id WHERE d.id=$1::uuid AND e.id=$2::uuid AND e.organization_id=$3::uuid`, id, envelopeID, org).Scan(&d.ID, &d.EnvelopeID, &d.Position, &d.Filename, &d.MimeType, &d.SizeBytes, &d.PageCount, &d.SHA256, &d.CompletedSHA256, &d.CreatedAt, &d.ObjectKey, &d.CompletedObjectKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return StoredDocument{}, ErrNotFound
	}
	return d, err
}

func (s *PostgresStore) Delete(ctx context.Context, org, envelopeID, id string) (string, error) {
	var key string
	err := s.db.QueryRow(ctx, `DELETE FROM documents d USING envelopes e WHERE d.id=$1::uuid AND e.id=d.envelope_id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status='draft' RETURNING d.object_key`, id, envelopeID, org).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return key, err
}
