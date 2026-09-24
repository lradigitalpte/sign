package field

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

const cols = `f.id::text,f.document_id::text,f.recipient_id::text,f.type::text,f.page,f.x::float8,f.y::float8,f.width::float8,f.height::float8,f.label,f.required,f.options,f.created_at,f.updated_at`
const ret = `id::text,document_id::text,recipient_id::text,type::text,page,x::float8,y::float8,width::float8,height::float8,label,required,options,created_at,updated_at`

func scan(row pgx.Row) (Field, error) {
	var f Field
	err := row.Scan(&f.ID, &f.DocumentID, &f.RecipientID, &f.Type, &f.Page, &f.X, &f.Y, &f.Width, &f.Height, &f.Label, &f.Required, &f.Options, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Field{}, ErrNotFound
	}
	return f, err
}
func (s *PostgresStore) List(ctx context.Context, org, envelopeID string) ([]Field, error) {
	rows, err := s.db.Query(ctx, `SELECT `+cols+` FROM document_fields f JOIN documents d ON d.id=f.document_id JOIN envelopes e ON e.id=d.envelope_id WHERE e.id=$1::uuid AND e.organization_id=$2::uuid ORDER BY d.position,f.page,f.created_at`, envelopeID, org)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Field{}
	for rows.Next() {
		f, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
func (s *PostgresStore) Create(ctx context.Context, org, envelopeID string, i CreateInput, required bool) (Field, error) {
	return scan(s.db.QueryRow(ctx, `INSERT INTO document_fields(document_id,recipient_id,type,page,x,y,width,height,label,required,options) SELECT d.id,r.id,$5::field_type,$6,$7,$8,$9,$10,$11,$12,$13 FROM documents d JOIN envelopes e ON e.id=d.envelope_id JOIN recipients r ON r.envelope_id=e.id WHERE d.id=$1::uuid AND r.id=$2::uuid AND e.id=$3::uuid AND e.organization_id=$4::uuid AND e.status='draft' AND $6<=d.page_count RETURNING `+ret, i.DocumentID, i.RecipientID, envelopeID, org, i.Type, i.Page, i.X, i.Y, i.Width, i.Height, i.Label, required, i.Options))
}
func (s *PostgresStore) Update(ctx context.Context, org, envelopeID, id string, i UpdateInput) (Field, error) {
	return scan(s.db.QueryRow(ctx, `UPDATE document_fields f SET recipient_id=COALESCE($4::uuid,f.recipient_id),page=COALESCE($5,f.page),x=COALESCE($6,f.x),y=COALESCE($7,f.y),width=COALESCE($8,f.width),height=COALESCE($9,f.height),label=COALESCE($10,f.label),required=COALESCE($11,f.required),options=COALESCE($12,f.options),updated_at=now() FROM documents d,envelopes e,recipients r WHERE f.id=$1::uuid AND d.id=f.document_id AND e.id=d.envelope_id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status='draft' AND r.id=COALESCE($4::uuid,f.recipient_id) AND r.envelope_id=e.id AND COALESCE($5,f.page)<=d.page_count AND COALESCE($6,f.x)+COALESCE($8,f.width)<=100 AND COALESCE($7,f.y)+COALESCE($9,f.height)<=100 RETURNING `+cols, id, envelopeID, org, i.RecipientID, i.Page, i.X, i.Y, i.Width, i.Height, i.Label, i.Required, i.Options))
}
func (s *PostgresStore) Delete(ctx context.Context, org, envelopeID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM document_fields f USING documents d,envelopes e WHERE f.id=$1::uuid AND d.id=f.document_id AND e.id=d.envelope_id AND e.id=$2::uuid AND e.organization_id=$3::uuid AND e.status='draft'`, id, envelopeID, org)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
