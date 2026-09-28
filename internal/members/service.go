package members

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/email"
	"signing-platform/internal/securetoken"
)

var (
	ErrInvitationNotFound = errors.New("invitation not found")
	ErrInvitationInactive = errors.New("this invitation is no longer valid")
	ErrInvitationEmail    = errors.New("this invitation was sent to a different email address")
)

// Roles an owner or admin can grant. "owner" is only ever assigned to the creator of an organization.
var assignableRoles = map[string]bool{"admin": true, "member": true, "viewer": true}

func IsManager(role string) bool { return role == "owner" || role == "admin" }

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
	EmailSent      bool      `json:"emailSent"`
}

// InvitationPreview is what an unauthenticated visitor of an invitation link may see.
type InvitationPreview struct {
	OrganizationName string    `json:"organizationName"`
	InviterName      string    `json:"inviterName"`
	Email            string    `json:"email"`
	Role             string    `json:"role"`
	Status           string    `json:"status"`
	ExpiresAt        time.Time `json:"expiresAt"`
}

type Organization struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Role     string `json:"role"`
	Personal bool   `json:"personal"`
}

type Service struct {
	db        *pgxpool.Pool
	mailer    email.Mailer
	webOrigin string
	logger    *slog.Logger
}

func NewService(db *pgxpool.Pool) *Service { return &Service{db: db, logger: slog.Default()} }

// WithMailer enables invitation emails. Without it invitations still work through the copied link.
func (s *Service) WithMailer(mailer email.Mailer, webOrigin string, logger *slog.Logger) *Service {
	s.mailer = mailer
	s.webOrigin = strings.TrimRight(webOrigin, "/")
	if logger != nil {
		s.logger = logger
	}
	return s
}

const invitationColumns = `id::text, organization_id::text, email, role::text, status::text, token, invited_by::text, expires_at, created_at, updated_at`

func scanInvitation(row pgx.Row) (Invitation, error) {
	var inv Invitation
	err := row.Scan(&inv.ID, &inv.OrganizationID, &inv.Email, &inv.Role, &inv.Status, &inv.Token, &inv.InvitedBy, &inv.ExpiresAt, &inv.CreatedAt, &inv.UpdatedAt)
	return inv, err
}

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

func (s *Service) memberRole(ctx context.Context, organizationID, memberID string) (string, error) {
	var role string
	err := s.db.QueryRow(ctx, `
SELECT role::text FROM organization_memberships
WHERE organization_id=$1::uuid AND user_id=$2::uuid`, organizationID, memberID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("member not found")
	}
	return role, err
}

func (s *Service) UpdateRole(ctx context.Context, organizationID, actorID, memberID, newRole string) error {
	newRole = strings.ToLower(strings.TrimSpace(newRole))
	if !assignableRoles[newRole] {
		return errors.New("invalid role: must be admin, member, or viewer")
	}
	if actorID == memberID {
		return errors.New("you cannot change your own role")
	}
	currentRole, err := s.memberRole(ctx, organizationID, memberID)
	if err != nil {
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

func (s *Service) Remove(ctx context.Context, organizationID, actorID, memberID string) error {
	if actorID == memberID {
		return errors.New("you cannot remove yourself from the workspace")
	}
	currentRole, err := s.memberRole(ctx, organizationID, memberID)
	if err != nil {
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

func (s *Service) Invite(ctx context.Context, organizationID, invitedByUserID, emailAddress, role string) (*Invitation, error) {
	emailAddress = strings.ToLower(strings.TrimSpace(emailAddress))
	if emailAddress == "" || !strings.Contains(emailAddress, "@") {
		return nil, errors.New("valid email is required")
	}
	role = strings.ToLower(strings.TrimSpace(role))
	if role == "" {
		role = "member"
	}
	if !assignableRoles[role] {
		return nil, errors.New("invalid role: must be admin, member, or viewer")
	}

	var personal bool
	if err := s.db.QueryRow(ctx, `SELECT slug LIKE 'personal-%' FROM organizations WHERE id=$1::uuid`, organizationID).Scan(&personal); err != nil {
		return nil, err
	}
	if personal {
		return nil, errors.New("personal workspaces can't have members; create an organization to invite people")
	}

	var existingCount int
	err := s.db.QueryRow(ctx, `
SELECT count(*) FROM organization_memberships m
JOIN users u ON u.id = m.user_id
WHERE m.organization_id=$1::uuid AND LOWER(u.email)=LOWER($2)`, organizationID, emailAddress).Scan(&existingCount)
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
WHERE organization_id=$1::uuid AND LOWER(email)=LOWER($2) AND status='pending'`, organizationID, emailAddress)

	token, _, err := securetoken.Generate()
	if err != nil {
		return nil, err
	}

	inv, err := scanInvitation(s.db.QueryRow(ctx, `
INSERT INTO organization_invitations (organization_id, email, role, status, token, invited_by, expires_at)
VALUES ($1::uuid, $2, $3::membership_role, 'pending', $4, $5::uuid, $6)
RETURNING `+invitationColumns,
		organizationID, emailAddress, role, token, invitedByUserID, time.Now().Add(7*24*time.Hour),
	))
	if err != nil {
		return nil, err
	}
	inv.EmailSent = s.sendInvitationEmail(ctx, inv)
	return &inv, nil
}

func (s *Service) sendInvitationEmail(ctx context.Context, inv Invitation) bool {
	if s.mailer == nil {
		return false
	}
	var organizationName, inviterName string
	err := s.db.QueryRow(ctx, `
SELECT o.name, u.name FROM organizations o, users u
WHERE o.id=$1::uuid AND u.id=$2::uuid`, inv.OrganizationID, inv.InvitedBy).Scan(&organizationName, &inviterName)
	if err != nil {
		s.logger.Warn("load invitation email details", "error", err)
		return false
	}
	link := s.webOrigin + "/invitations/" + inv.Token
	message := email.OrganizationInvite(inv.Email, organizationName, inviterName, inv.Role, link, inv.ExpiresAt)
	sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if _, err := s.mailer.Send(sendCtx, message); err != nil {
		s.logger.Warn("send organization invitation", "error", err)
		return false
	}
	return true
}

func (s *Service) ListInvitations(ctx context.Context, organizationID string) ([]Invitation, error) {
	rows, err := s.db.Query(ctx, `
SELECT `+invitationColumns+`
FROM organization_invitations
WHERE organization_id=$1::uuid AND status='pending' AND expires_at > now()
ORDER BY created_at DESC`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	values := []Invitation{}
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
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
	inv, err := scanInvitation(s.db.QueryRow(ctx, `
UPDATE organization_invitations
SET token=$3, expires_at=now() + interval '7 days', updated_at=now()
WHERE id=$1::uuid AND organization_id=$2::uuid AND status='pending'
RETURNING `+invitationColumns,
		invitationID, organizationID, newToken,
	))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvitationNotFound
		}
		return nil, err
	}
	inv.EmailSent = s.sendInvitationEmail(ctx, inv)
	return &inv, nil
}

// PreviewInvitation describes an invitation to whoever holds its link, before they sign in.
func (s *Service) PreviewInvitation(ctx context.Context, token string) (*InvitationPreview, error) {
	var preview InvitationPreview
	err := s.db.QueryRow(ctx, `
SELECT o.name, u.name, i.email, i.role::text,
       CASE WHEN i.status='pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status::text END,
       i.expires_at
FROM organization_invitations i
JOIN organizations o ON o.id = i.organization_id
JOIN users u ON u.id = i.invited_by
WHERE i.token=$1`, token).Scan(&preview.OrganizationName, &preview.InviterName, &preview.Email, &preview.Role, &preview.Status, &preview.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &preview, nil
}

// AcceptInvitation adds the signed-in user to the inviting organization. The user's email must
// match the invited address so a forwarded link cannot be used by someone else.
func (s *Service) AcceptInvitation(ctx context.Context, token, userID, userEmail string) (*Organization, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var invitationID, organizationID, invitedEmail, role, status string
	var expiresAt time.Time
	err = tx.QueryRow(ctx, `
SELECT id::text, organization_id::text, email, role::text, status::text, expires_at
FROM organization_invitations WHERE token=$1 FOR UPDATE`, token).
		Scan(&invitationID, &organizationID, &invitedEmail, &role, &status, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	if status != "pending" || !expiresAt.After(time.Now()) {
		return nil, ErrInvitationInactive
	}
	if !strings.EqualFold(strings.TrimSpace(invitedEmail), strings.TrimSpace(userEmail)) {
		return nil, ErrInvitationEmail
	}

	// An existing membership keeps its current role.
	if _, err := tx.Exec(ctx, `
INSERT INTO organization_memberships (organization_id, user_id, role)
VALUES ($1::uuid, $2::uuid, $3::membership_role)
ON CONFLICT (organization_id, user_id) DO NOTHING`, organizationID, userID, role); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
UPDATE organization_invitations
SET status='accepted', accepted_by=$2::uuid, accepted_at=now(), updated_at=now()
WHERE id=$1::uuid`, invitationID, userID); err != nil {
		return nil, err
	}

	var org Organization
	err = tx.QueryRow(ctx, `
SELECT o.id::text, o.name, o.slug, m.role::text, o.slug LIKE 'personal-%'
FROM organizations o JOIN organization_memberships m ON m.organization_id = o.id
WHERE o.id=$1::uuid AND m.user_id=$2::uuid`, organizationID, userID).Scan(&org.ID, &org.Name, &org.Slug, &org.Role, &org.Personal)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &org, nil
}

// CreateOrganization creates a shared workspace owned by the user.
func (s *Service) CreateOrganization(ctx context.Context, ownerID, name string) (*Organization, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 100 {
		return nil, errors.New("organization name must be between 1 and 100 characters")
	}
	suffix, _, err := securetoken.Generate()
	if err != nil {
		return nil, err
	}
	slug := "org-" + strings.ToLower(suffix[:12])

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	org := Organization{Name: name, Slug: slug, Role: "owner"}
	if err := tx.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id::text`, name, slug).Scan(&org.ID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
INSERT INTO organization_memberships (organization_id, user_id, role)
VALUES ($1::uuid, $2::uuid, 'owner')`, org.ID, ownerID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &org, nil
}
