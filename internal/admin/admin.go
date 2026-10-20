// Package admin backs the internal admin app (apps/admin) and cmd/admin: platform staff who can
// view and manage workspaces, users, envelopes and background jobs across every workspace.
package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/document"
	"signing-platform/internal/identity"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/members"
	"signing-platform/internal/send"
	"signing-platform/internal/webhooks"
)

// Role is a platform admin role. Higher roles include everything lower roles can do.
type Role string

const (
	RoleReadOnly   Role = "read_only"
	RoleSupport    Role = "support"
	RoleSuperAdmin Role = "super_admin"
)

var roleRank = map[Role]int{RoleReadOnly: 1, RoleSupport: 2, RoleSuperAdmin: 3}

func (r Role) Valid() bool { return roleRank[r] > 0 }

// Allows reports whether r grants at least the access of minimum.
func (r Role) Allows(minimum Role) bool { return roleRank[r] >= roleRank[minimum] }

var (
	ErrNotAdmin     = errors.New("not a platform admin")
	ErrUserNotFound = errors.New("no user with that email; they must sign in to Signet once first")
	ErrInvalidRole  = errors.New("role must be read_only, support or super_admin")
	ErrLastSuper    = errors.New("cannot remove the last super_admin")
)

type Admin struct {
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      Role      `json:"role"`
	GrantedBy *string   `json:"grantedBy,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// AuditEvent is one admin action. Before and After hold the changed fields only.
type AuditEvent struct {
	AdminUserID *string
	Action      string
	TargetType  string
	TargetID    string
	Reason      string
	Before      any
	After       any
	IPAddress   string
	UserAgent   string
}

// execer is satisfied by *pgxpool.Pool and pgx.Tx, so audit writes can join the change's transaction.
type execer interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

type Service struct {
	db          *pgxpool.Pool
	generate    func() (send.Token, error)
	invitations *members.Service
	webhooks    *webhooks.Processor
	lifecycle   *lifecycle.Service
	documents   *document.Service
	system      SystemOptions
	directory   identity.DirectoryAdmin
}

func NewService(db *pgxpool.Pool) *Service { return &Service{db: db} }

// WithSigningLinks lets the service issue signing links, which resending an envelope needs.
func (s *Service) WithSigningLinks(generate func() (send.Token, error)) *Service {
	s.generate = generate
	return s
}

const adminColumns = `u.id::text, u.email, u.name, a.role::text, a.granted_by::text, a.created_at`

func scanAdmin(row pgx.Row) (Admin, error) {
	var a Admin
	var role string
	if err := row.Scan(&a.UserID, &a.Email, &a.Name, &role, &a.GrantedBy, &a.CreatedAt); err != nil {
		return Admin{}, err
	}
	a.Role = Role(role)
	return a, nil
}

// ResolveSubject maps a verified WorkOS user ID to an active (not suspended) platform admin.
func (s *Service) ResolveSubject(ctx context.Context, subject string) (Admin, error) {
	a, err := scanAdmin(s.db.QueryRow(ctx, `
SELECT `+adminColumns+`
FROM auth_identities i
JOIN users u ON u.id = i.user_id
JOIN platform_admins a ON a.user_id = u.id
WHERE i.provider = 'workos' AND i.provider_subject = $1 AND u.suspended_at IS NULL`, subject))
	if errors.Is(err, pgx.ErrNoRows) {
		return Admin{}, ErrNotAdmin
	}
	return a, err
}

func (s *Service) List(ctx context.Context) ([]Admin, error) {
	rows, err := s.db.Query(ctx, `SELECT `+adminColumns+` FROM platform_admins a JOIN users u ON u.id = a.user_id ORDER BY a.created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	admins := []Admin{}
	for rows.Next() {
		a, err := scanAdmin(rows)
		if err != nil {
			return nil, err
		}
		admins = append(admins, a)
	}
	return admins, rows.Err()
}

// Grant makes the user with this email a platform admin, or changes their role.
// actor is the admin making the change, or nil when run from cmd/admin.
func (s *Service) Grant(ctx context.Context, email string, role Role, actor *string) (Admin, error) {
	return s.grant(ctx, email, role, actor, "")
}

func (s *Service) grant(ctx context.Context, email string, role Role, actor *string, reason string) (Admin, error) {
	if !role.Valid() {
		return Admin{}, ErrInvalidRole
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Admin{}, err
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE email = lower(trim($1))`, email).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Admin{}, ErrUserNotFound
	}
	if err != nil {
		return Admin{}, err
	}
	var previous *string
	if err := tx.QueryRow(ctx, `SELECT role::text FROM platform_admins WHERE user_id = $1::uuid`, userID).Scan(&previous); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Admin{}, err
	}
	if previous != nil && Role(*previous) == RoleSuperAdmin && role != RoleSuperAdmin {
		if err := ensureAnotherSuper(ctx, tx, userID); err != nil {
			return Admin{}, err
		}
	}
	if _, err := tx.Exec(ctx, `
INSERT INTO platform_admins (user_id, role, granted_by) VALUES ($1::uuid, $2::platform_admin_role, $3::uuid)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`, userID, string(role), actor); err != nil {
		return Admin{}, err
	}
	var before any
	if previous != nil {
		before = map[string]string{"role": *previous}
	}
	if err := RecordAudit(ctx, tx, AuditEvent{AdminUserID: actor, Action: "admin.grant", TargetType: "admin", TargetID: userID, Reason: reason, Before: before, After: map[string]string{"role": string(role)}}); err != nil {
		return Admin{}, err
	}
	a, err := scanAdmin(tx.QueryRow(ctx, `SELECT `+adminColumns+` FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1::uuid`, userID))
	if err != nil {
		return Admin{}, err
	}
	return a, tx.Commit(ctx)
}

// Bootstrap makes each email a super_admin unless they're already an admin, so it never changes a role someone
// set in the admin app. It returns what happened to each email; one that hasn't signed in yet is skipped.
func (s *Service) Bootstrap(ctx context.Context, emails []string) map[string]error {
	results := make(map[string]error, len(emails))
	for _, email := range emails {
		var exists bool
		if err := s.db.QueryRow(ctx, `
SELECT EXISTS (SELECT 1 FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE u.email = lower(trim($1)))`, email).Scan(&exists); err != nil {
			results[email] = err
			continue
		}
		if exists {
			continue
		}
		_, results[email] = s.grant(ctx, email, RoleSuperAdmin, nil, "BOOTSTRAP_SUPER_ADMINS")
	}
	return results
}

// Revoke removes platform admin access. The last super_admin can't be removed.
func (s *Service) Revoke(ctx context.Context, email string, actor *string, reason string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID, role string
	err = tx.QueryRow(ctx, `SELECT a.user_id::text, a.role::text FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE u.email = lower(trim($1))`, email).Scan(&userID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotAdmin
	}
	if err != nil {
		return err
	}
	if Role(role) == RoleSuperAdmin {
		if err := ensureAnotherSuper(ctx, tx, userID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM platform_admins WHERE user_id = $1::uuid`, userID); err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, AuditEvent{AdminUserID: actor, Action: "admin.revoke", TargetType: "admin", TargetID: userID, Reason: reason, Before: map[string]string{"role": role}}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func ensureAnotherSuper(ctx context.Context, tx pgx.Tx, exceptUserID string) error {
	var others int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM platform_admins WHERE role = 'super_admin' AND user_id <> $1::uuid`, exceptUserID).Scan(&others); err != nil {
		return err
	}
	if others == 0 {
		return ErrLastSuper
	}
	return nil
}

// RecordAudit appends an admin audit event. Pass the transaction that made the change so both commit together.
func RecordAudit(ctx context.Context, db execer, event AuditEvent) error {
	before, err := jsonOrNil(event.Before)
	if err != nil {
		return err
	}
	after, err := jsonOrNil(event.After)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
INSERT INTO admin_audit_events (admin_user_id, action, target_type, target_id, reason, before, after, ip_address, user_agent)
VALUES ($1::uuid, $2, $3, $4, NULLIF($5, ''), $6, $7, NULLIF($8, ''), NULLIF($9, ''))`,
		event.AdminUserID, event.Action, event.TargetType, event.TargetID, strings.TrimSpace(event.Reason), before, after, event.IPAddress, event.UserAgent)
	if err != nil {
		return fmt.Errorf("record admin audit event: %w", err)
	}
	return nil
}

func jsonOrNil(value any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return json.Marshal(value)
}
