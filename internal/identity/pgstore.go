package identity

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Upsert(ctx context.Context, provider string, source ProviderUser, organization ProviderOrganization) (Session, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback(ctx)

	var user User
	query := `
INSERT INTO users (email, name, email_verified_at)
VALUES ($1, $2, CASE WHEN $3::boolean THEN now() ELSE NULL END)
ON CONFLICT (email) DO UPDATE SET
  email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at),
  updated_at = now()
RETURNING id::text, email, name, email_verified_at, COALESCE(avatar_data_url, '')`
	if err := tx.QueryRow(ctx, query, source.Email, source.Name, source.EmailVerified).Scan(&user.ID, &user.Email, &user.Name, &user.EmailVerifiedAt, &user.AvatarDataURL); err != nil {
		return Session{}, fmt.Errorf("upsert user: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email)
VALUES ($1::uuid, $2, $3, $4)
ON CONFLICT (provider, provider_subject) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  provider_email = EXCLUDED.provider_email,
  updated_at = now()`, user.ID, provider, source.Subject, source.Email)
	if err != nil {
		return Session{}, fmt.Errorf("upsert identity: %w", err)
	}

	var workspace Workspace
	slug := "workos-" + organization.Subject
	if organization.Personal {
		slug = "personal-" + user.ID
	}
	err = tx.QueryRow(ctx, `
WITH existing AS (
  SELECT organization_id FROM organization_auth_identities
  WHERE provider = $1 AND provider_subject = $2
), updated AS (
  UPDATE organizations SET name = $3, updated_at = now()
  WHERE id = (SELECT organization_id FROM existing)
  RETURNING id, name, slug
), inserted AS (
  INSERT INTO organizations (name, slug)
  SELECT $3, $4 WHERE NOT EXISTS (SELECT 1 FROM updated)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id, name, slug
)
SELECT id::text, name, slug FROM updated
UNION ALL SELECT id::text, name, slug FROM inserted
LIMIT 1`, provider, organization.Subject, organization.Name, slug).Scan(&workspace.ID, &workspace.Name, &workspace.Slug)
	if err != nil {
		return Session{}, fmt.Errorf("upsert workspace: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO organization_auth_identities (organization_id, provider, provider_subject)
VALUES ($1::uuid, $2, $3)
ON CONFLICT (provider, provider_subject) DO UPDATE SET organization_id = EXCLUDED.organization_id`, workspace.ID, provider, organization.Subject)
	if err != nil {
		return Session{}, fmt.Errorf("upsert workspace identity: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO organization_memberships (organization_id, user_id, role)
VALUES ($1::uuid, $2::uuid, $3::membership_role)
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`, workspace.ID, user.ID, organization.Role)
	if err != nil {
		return Session{}, fmt.Errorf("upsert membership: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Session{}, err
	}
	user.Provider = provider
	user.ProviderSubject = source.Subject
	workspace.Role = organization.Role
	return Session{User: user, Workspace: workspace}, nil
}

func (s *PostgresStore) UpdateProfile(ctx context.Context, userID, name string, avatarDataURL *string) (User, error) {
	var user User
	err := s.db.QueryRow(ctx, `UPDATE users SET name = $2, avatar_data_url = $3, updated_at = now() WHERE id = $1::uuid RETURNING id::text, email, name, email_verified_at, COALESCE(avatar_data_url, '')`, userID, name, avatarDataURL).Scan(&user.ID, &user.Email, &user.Name, &user.EmailVerifiedAt, &user.AvatarDataURL)
	if err != nil {
		return User{}, fmt.Errorf("update profile: %w", err)
	}
	return user, nil
}
