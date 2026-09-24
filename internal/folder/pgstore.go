package folder

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func scan(row pgx.Row) (Folder, error) {
	var value Folder
	err := row.Scan(&value.ID, &value.OrganizationID, &value.Name, &value.CreatedBy, &value.EnvelopeCount, &value.CreatedAt, &value.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Folder{}, ErrNotFound
	}
	return value, err
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "folders_org_name_lower_unique")
}

func (s *PostgresStore) List(ctx context.Context, organizationID string) ([]Folder, error) {
	rows, err := s.db.Query(ctx, `
SELECT f.id::text, f.organization_id::text, f.name, f.created_by::text,
       COALESCE(c.cnt, 0), f.created_at, f.updated_at
FROM folders f
LEFT JOIN (
  SELECT folder_id, count(*)::int AS cnt
  FROM envelopes
  WHERE organization_id=$1::uuid AND folder_id IS NOT NULL
  GROUP BY folder_id
) c ON c.folder_id = f.id
WHERE f.organization_id=$1::uuid
ORDER BY lower(f.name), f.created_at`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []Folder{}
	for rows.Next() {
		value, err := scan(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *PostgresStore) Create(ctx context.Context, organizationID, userID, name string) (Folder, error) {
	value, err := scan(s.db.QueryRow(ctx, `
INSERT INTO folders (organization_id, created_by, name)
VALUES ($1::uuid, $2::uuid, $3)
RETURNING id::text, organization_id::text, name, created_by::text, 0, created_at, updated_at`, organizationID, userID, name))
	if isUniqueViolation(err) {
		return Folder{}, ErrConflict
	}
	return value, err
}

func (s *PostgresStore) Update(ctx context.Context, organizationID, id, name string) (Folder, error) {
	value, err := scan(s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE folders SET name=$3, updated_at=now()
  WHERE id=$1::uuid AND organization_id=$2::uuid
  RETURNING id, organization_id, name, created_by, created_at, updated_at
)
SELECT u.id::text, u.organization_id::text, u.name, u.created_by::text,
       COALESCE((SELECT count(*)::int FROM envelopes e WHERE e.folder_id=u.id), 0),
       u.created_at, u.updated_at
FROM updated u`, id, organizationID, name))
	if isUniqueViolation(err) {
		return Folder{}, ErrConflict
	}
	return value, err
}

func (s *PostgresStore) Delete(ctx context.Context, organizationID, id string) error {
	var count int
	err := s.db.QueryRow(ctx, `
SELECT count(*)::int FROM envelopes
WHERE organization_id=$1::uuid AND folder_id=$2::uuid`, organizationID, id).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrNotEmpty
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM folders WHERE id=$1::uuid AND organization_id=$2::uuid`, id, organizationID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) TransferEnvelopes(ctx context.Context, organizationID, fromFolderID string, toFolderID *string) (int, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND organization_id=$2::uuid)`, fromFolderID, organizationID).Scan(&exists)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0, ErrNotFound
	}
	if toFolderID != nil {
		err = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND organization_id=$2::uuid)`, *toFolderID, organizationID).Scan(&exists)
		if err != nil {
			return 0, err
		}
		if !exists {
			return 0, ErrNotFound
		}
	}
	tag, err := s.db.Exec(ctx, `
UPDATE envelopes SET folder_id=$3::uuid, updated_at=now()
WHERE organization_id=$1::uuid AND folder_id=$2::uuid`, organizationID, fromFolderID, toFolderID)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
