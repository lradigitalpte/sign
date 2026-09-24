package recipient

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

const cols = `r.id::text,r.envelope_id::text,r.user_id::text,r.name,r.email,r.role::text,r.status::text,r.signing_order,r.private_message,r.created_at,r.updated_at`
const returnCols = `id::text,envelope_id::text,user_id::text,name,email,role::text,status::text,signing_order,private_message,created_at,updated_at`

func scan(row pgx.Row) (Recipient, error) {
	var r Recipient
	err := row.Scan(&r.ID, &r.EnvelopeID, &r.UserID, &r.Name, &r.Email, &r.Role, &r.Status, &r.SigningOrder, &r.PrivateMessage, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Recipient{}, ErrNotFound
	}
	return r, err
}
func (s *PostgresStore) List(ctx context.Context, org, envelopeID string) ([]Recipient, error) {
	rows, err := s.db.Query(ctx, `SELECT `+cols+` FROM recipients r JOIN envelopes e ON e.id=r.envelope_id WHERE e.id=$1::uuid AND e.organization_id=$2::uuid ORDER BY r.signing_order,r.created_at`, envelopeID, org)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Recipient{}
	for rows.Next() {
		r, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *PostgresStore) Create(ctx context.Context, org, envelopeID string, input CreateInput) (Recipient, error) {
	return scan(s.db.QueryRow(ctx, `INSERT INTO recipients(envelope_id,name,email,role,signing_order,private_message) SELECT e.id,$3,$4,$5::recipient_role,CASE WHEN $6=0 THEN COALESCE((SELECT max(signing_order)+1 FROM recipients WHERE envelope_id=e.id),1) ELSE $6 END,$7 FROM envelopes e WHERE e.id=$1::uuid AND e.organization_id=$2::uuid AND e.status='draft' RETURNING `+returnCols, envelopeID, org, input.Name, input.Email, input.Role, input.SigningOrder, input.PrivateMessage))
}
func (s *PostgresStore) Update(ctx context.Context, org, envelopeID, id string, input UpdateInput) (Recipient, error) {
	return scan(s.db.QueryRow(ctx, `UPDATE recipients r SET name=COALESCE($4,name),email=COALESCE($5,email),role=COALESCE($6::recipient_role,role),signing_order=COALESCE($7,signing_order),private_message=COALESCE($8,private_message),updated_at=now() FROM envelopes e WHERE r.id=$1::uuid AND r.envelope_id=e.id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status='draft' RETURNING `+cols, id, envelopeID, org, input.Name, input.Email, input.Role, input.SigningOrder, input.PrivateMessage))
}
func (s *PostgresStore) IsTemplate(ctx context.Context, org, envelopeID string) (bool, error) {
	var isTemplate bool
	err := s.db.QueryRow(ctx, `SELECT is_template FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid`, envelopeID, org).Scan(&isTemplate)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return isTemplate, err
}
func (s *PostgresStore) Delete(ctx context.Context, org, envelopeID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM recipients r USING envelopes e WHERE r.id=$1::uuid AND r.envelope_id=e.id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status='draft'`, id, envelopeID, org)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
