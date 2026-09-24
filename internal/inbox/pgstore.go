package inbox

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) List(ctx context.Context, email string) ([]Item, error) {
	rows, err := s.db.Query(ctx, `
SELECT r.id::text, e.id::text, e.title, r.status::text, r.role::text, u.name, o.name,
       (SELECT count(*) FROM document_fields f WHERE f.recipient_id=r.id),
       e.expires_at, r.updated_at
FROM recipients r
JOIN envelopes e ON e.id = r.envelope_id
JOIN organizations o ON o.id = e.organization_id
JOIN users u ON u.id = e.created_by
WHERE r.email=$1 AND r.role <> 'cc' AND e.status IN ('in_progress','completed','voided')
ORDER BY r.updated_at DESC`, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Item{}
	for rows.Next() {
		var item Item
		if err := rows.Scan(&item.RecipientID, &item.EnvelopeID, &item.Title, &item.Status, &item.Role, &item.SenderName, &item.CompanyName, &item.FieldCount, &item.ExpiresAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) IssueAccess(ctx context.Context, email, recipientID string, hash []byte, expires time.Time) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
INSERT INTO signing_tokens(recipient_id, token_hash, expires_at)
SELECT r.id, $3, $4
FROM recipients r
JOIN envelopes e ON e.id = r.envelope_id
WHERE r.id=$1::uuid AND r.email=$2 AND r.role <> 'cc' AND r.status IN ('sent','viewed') AND e.status='in_progress'
RETURNING recipient_id::text`, recipientID, email, hash, expires).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}
