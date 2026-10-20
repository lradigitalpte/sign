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
	return err != nil && strings.Contains(err.Error(), "folders_team_name_lower_unique")
}

// Folders belong to a team: every method takes the team's ID.

func (s *PostgresStore) List(ctx context.Context, teamID string) ([]Folder, error) {
	rows, err := s.db.Query(ctx, `
SELECT f.id::text, f.organization_id::text, f.name, f.created_by::text,
       COALESCE(c.cnt, 0), f.created_at, f.updated_at
FROM folders f
LEFT JOIN (
  SELECT folder_id, count(*)::int AS cnt
  FROM envelopes
  WHERE team_id::text=$1 AND folder_id IS NOT NULL
  GROUP BY folder_id
) c ON c.folder_id = f.id
WHERE f.team_id::text=$1
ORDER BY lower(f.name), f.created_at`, teamID)
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

func (s *PostgresStore) Create(ctx context.Context, teamID, userID, name string) (Folder, error) {
	value, err := scan(s.db.QueryRow(ctx, `
INSERT INTO folders (organization_id, team_id, created_by, name)
SELECT t.organization_id, t.id, $2::uuid, $3 FROM teams t WHERE t.id::text = $1
RETURNING id::text, organization_id::text, name, created_by::text, 0, created_at, updated_at`, teamID, userID, name))
	if isUniqueViolation(err) {
		return Folder{}, ErrConflict
	}
	return value, err
}

func (s *PostgresStore) Update(ctx context.Context, teamID, id, name string) (Folder, error) {
	value, err := scan(s.db.QueryRow(ctx, `
WITH updated AS (
  UPDATE folders SET name=$3, updated_at=now()
  WHERE id=$1::uuid AND team_id::text=$2
  RETURNING id, organization_id, name, created_by, created_at, updated_at
)
SELECT u.id::text, u.organization_id::text, u.name, u.created_by::text,
       COALESCE((SELECT count(*)::int FROM envelopes e WHERE e.folder_id=u.id), 0),
       u.created_at, u.updated_at
FROM updated u`, id, teamID, name))
	if isUniqueViolation(err) {
		return Folder{}, ErrConflict
	}
	return value, err
}

func (s *PostgresStore) Delete(ctx context.Context, teamID, id string) error {
	var count int
	err := s.db.QueryRow(ctx, `
SELECT count(*)::int FROM envelopes
WHERE team_id::text=$1 AND folder_id=$2::uuid`, teamID, id).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrNotEmpty
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM folders WHERE id=$1::uuid AND team_id::text=$2`, id, teamID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) TransferEnvelopes(ctx context.Context, teamID, fromFolderID string, toFolderID *string) (int, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND team_id::text=$2)`, fromFolderID, teamID).Scan(&exists)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0, ErrNotFound
	}
	if toFolderID != nil {
		err = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM folders WHERE id=$1::uuid AND team_id::text=$2)`, *toFolderID, teamID).Scan(&exists)
		if err != nil {
			return 0, err
		}
		if !exists {
			return 0, ErrNotFound
		}
	}
	tag, err := s.db.Exec(ctx, `
UPDATE envelopes SET folder_id=$3::uuid, updated_at=now()
WHERE team_id::text=$1 AND folder_id=$2::uuid`, teamID, fromFolderID, toFolderID)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
