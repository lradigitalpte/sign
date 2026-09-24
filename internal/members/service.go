package members

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/securetoken"
)

type Member struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

type Invitation struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organizationId"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	Status         string    `json:"status"`
	Token          string    `json:"token"`
	InvitedBy      string    `json:"invitedBy"`
	ExpiresAt      time.Time `json:"expiresAt"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type Service struct{ db *pgxpool.Pool }

func NewService(db *pgxpool.Pool) *Service { return &Service{db: db} }

func (s *Service) List(ctx context.Context, organizationID string) ([]Member, error) {
	rows, err := s.db.Query(ctx, `
SELECT u.id::text, u.name, u.email, m.role::text, m.created_at
FROM organization_memberships m
JOIN users u ON u.id = m.user_id
WHERE m.organization_id=$1::uuid
ORDER BY m.created_at, u.email`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []Member{}
	for rows.Next() {
		var member Member
		if err := rows.Scan(&member.ID, &member.Name, &member.Email, &member.Role, &member.CreatedAt); err != nil {
			return nil, err
		}
		values = append(values, member)
	}
	return values, rows.Err()
}

func (s *Service) UpdateRole(ctx context.Context, organizationID, memberID, newRole string) error {
	newRole = strings.ToLower(strings.TrimSpace(newRole))
	if newRole != "admin" && newRole != "member" {
		return errors.New("invalid role: must be admin or member")
	}

	var currentRole string
	err := s.db.QueryRow(ctx, `
SELECT role::text FROM organization_memberships
WHERE organization_id=$1::uuid AND user_id=$2::uuid`, organizationID, memberID).Scan(&currentRole)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("member not found")
		}
		return err
	}

	if currentRole == "owner" {
		return errors.New("cannot change the role of the organization owner")
	}

	_, err = s.db.Exec(ctx, `
UPDATE organization_memberships
SET role=$3::membership_role
WHERE organization_id=$1::uuid AND user_id=$2::uuid`, organizationID, memberID, newRole)
	return err
}

func (s *Service) Remove(ctx context.Context, organizationID, memberID string) error {
	var currentRole string
	err := s.db.QueryRow(ctx, `
SELECT role::text FROM organization_memberships
WHERE organization_id=$1::uuid AND user_id=$2::uuid`, organizationID, memberID).Scan(&currentRole)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("member not found")
		}
		return err
	}

	if currentRole == "owner" {
		return errors.New("cannot remove the organization owner")
	}

	_, err = s.db.Exec(ctx, `
DELETE FROM organization_memberships
WHERE organization_id=$1::uuid AND user_id=$2::uuid`, organizationID, memberID)
	return err
}

func (s *Service) Invite(ctx context.Context, organizationID, invitedByUserID, email, role string) (*Invitation, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return nil, errors.New("valid email is required")
	}

	role = strings.ToLower(strings.TrimSpace(role))
	if role != "admin" && role != "member" {
		role = "member"
	}

	// Check if already a member
	var existingCount int
	err := s.db.QueryRow(ctx, `
SELECT count(*) FROM organization_memberships m
JOIN users u ON u.id = m.user_id
WHERE m.organization_id=$1::uuid AND LOWER(u.email)=LOWER($2)`, organizationID, email).Scan(&existingCount)
	if err != nil {
		return nil, err
	}
	if existingCount > 0 {
		return nil, errors.New("user is already a member of this organization")
	}

	// Revoke any previous pending invite for this email
	_, _ = s.db.Exec(ctx, `
UPDATE organization_invitations
SET status='revoked', updated_at=now()
WHERE organization_id=$1::uuid AND LOWER(email)=LOWER($2) AND status='pending'`, organizationID, email)

	token, _, err := securetoken.Generate()
	if err != nil {
		return nil, err
	}

	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	var inv Invitation
	err = s.db.QueryRow(ctx, `
INSERT INTO organization_invitations (organization_id, email, role, status, token, invited_by, expires_at)
VALUES ($1::uuid, $2, $3::membership_role, 'pending', $4, $5::uuid, $6)
RETURNING id::text, organization_id::text, email, role::text, status::text, token, invited_by::text, expires_at, created_at, updated_at`,
		organizationID, email, role, token, invitedByUserID, expiresAt,
	).Scan(
		&inv.ID, &inv.OrganizationID, &inv.Email, &inv.Role, &inv.Status, &inv.Token, &inv.InvitedBy, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &inv, nil
}

func (s *Service) ListInvitations(ctx context.Context, organizationID string) ([]Invitation, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, organization_id::text, email, role::text, status::text, token, invited_by::text, expires_at, created_at, updated_at
FROM organization_invitations
WHERE organization_id=$1::uuid AND status='pending' AND expires_at > now()
ORDER BY created_at DESC`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	values := []Invitation{}
	for rows.Next() {
		var inv Invitation
		if err := rows.Scan(
			&inv.ID, &inv.OrganizationID, &inv.Email, &inv.Role, &inv.Status, &inv.Token, &inv.InvitedBy, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
		); err != nil {
			return nil, err
		}
		values = append(values, inv)
	}
	return values, rows.Err()
}

func (s *Service) RevokeInvitation(ctx context.Context, organizationID, invitationID string) error {
	result, err := s.db.Exec(ctx, `
UPDATE organization_invitations
SET status='revoked', updated_at=now()
WHERE id=$1::uuid AND organization_id=$2::uuid AND status='pending'`, invitationID, organizationID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return errors.New("invitation not found or already processed")
	}
	return nil
}

func (s *Service) ResendInvitation(ctx context.Context, organizationID, invitationID string) (*Invitation, error) {
	newToken, _, err := securetoken.Generate()
	if err != nil {
		return nil, err
	}

	var inv Invitation
	err = s.db.QueryRow(ctx, `
UPDATE organization_invitations
SET token=$3, expires_at=now() + interval '7 days', updated_at=now()
WHERE id=$1::uuid AND organization_id=$2::uuid AND status='pending'
RETURNING id::text, organization_id::text, email, role::text, status::text, token, invited_by::text, expires_at, created_at, updated_at`,
		invitationID, organizationID, newToken,
	).Scan(
		&inv.ID, &inv.OrganizationID, &inv.Email, &inv.Role, &inv.Status, &inv.Token, &inv.InvitedBy, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("invitation not found")
		}
		return nil, err
	}
	return &inv, nil
}
