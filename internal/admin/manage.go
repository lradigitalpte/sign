package admin

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/members"
)

// WithInvitations lets the service resend workspace invitations through the customer app's own code.
func (s *Service) WithInvitations(invitations *members.Service) *Service {
	s.invitations = invitations
	return s
}

// ---- Suspension ----

type SuspensionResult struct {
	SuspendedAt     *time.Time `json:"suspendedAt"`
	SuspendedReason *string    `json:"suspendedReason"`
}

// setSuspension suspends or restores a workspace or user. table is "organizations" or "users" (never user input).
func (s *Service) setSuspension(ctx context.Context, actor Actor, targetType, table, id string, suspend bool, reason string) (SuspensionResult, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return SuspensionResult{}, err
	}
	if uuidOrNil(id) == nil {
		return SuspensionResult{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return SuspensionResult{}, err
	}
	defer tx.Rollback(ctx)

	var current SuspensionResult
	err = tx.QueryRow(ctx, `SELECT suspended_at, suspended_reason FROM `+table+` WHERE id = $1::uuid FOR UPDATE`, id).Scan(&current.SuspendedAt, &current.SuspendedReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return SuspensionResult{}, ErrNotFound
	}
	if err != nil {
		return SuspensionResult{}, err
	}
	if suspend == (current.SuspendedAt != nil) {
		if suspend {
			return SuspensionResult{}, conflict("already_suspended", "This is already suspended.")
		}
		return SuspensionResult{}, conflict("not_suspended", "This isn't suspended.")
	}

	var result SuspensionResult
	if suspend {
		err = tx.QueryRow(ctx, `UPDATE `+table+` SET suspended_at = now(), suspended_reason = $2, updated_at = now() WHERE id = $1::uuid RETURNING suspended_at, suspended_reason`, id, reason).
			Scan(&result.SuspendedAt, &result.SuspendedReason)
	} else {
		_, err = tx.Exec(ctx, `UPDATE `+table+` SET suspended_at = NULL, suspended_reason = NULL, updated_at = now() WHERE id = $1::uuid`, id)
	}
	if err != nil {
		return SuspensionResult{}, err
	}
	action := targetType + ".suspend"
	before, after := map[string]any{"suspended": false}, map[string]any{"suspended": true}
	if !suspend {
		action = targetType + ".unsuspend"
		before, after = map[string]any{"suspended": true, "reason": current.SuspendedReason}, map[string]any{"suspended": false}
	}
	if err := RecordAudit(ctx, tx, actor.target(targetType, action, id, reason, before, after)); err != nil {
		return SuspensionResult{}, err
	}
	return result, tx.Commit(ctx)
}

// SuspendWorkspace blocks every member from using the workspace until it is restored.
func (s *Service) SuspendWorkspace(ctx context.Context, actor Actor, id, reason string) (SuspensionResult, error) {
	return s.setSuspension(ctx, actor, "workspace", "organizations", id, true, reason)
}

func (s *Service) UnsuspendWorkspace(ctx context.Context, actor Actor, id, reason string) (SuspensionResult, error) {
	return s.setSuspension(ctx, actor, "workspace", "organizations", id, false, reason)
}

// SuspendUser blocks the person from using Signet. Platform admins must have their access revoked first,
// so nobody can lock another admin out of the admin app by suspending them.
func (s *Service) SuspendUser(ctx context.Context, actor Actor, id, reason string) (SuspensionResult, error) {
	if id == actor.Admin.UserID {
		return SuspensionResult{}, conflict("self", "You can't suspend yourself.")
	}
	var isAdmin bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id::text = $1)`, id).Scan(&isAdmin); err != nil {
		return SuspensionResult{}, err
	}
	if isAdmin {
		return SuspensionResult{}, conflict("is_admin", "This person is a platform admin. Remove their admin access first.")
	}
	return s.setSuspension(ctx, actor, "user", "users", id, true, reason)
}

func (s *Service) UnsuspendUser(ctx context.Context, actor Actor, id, reason string) (SuspensionResult, error) {
	return s.setSuspension(ctx, actor, "user", "users", id, false, reason)
}

// ---- Members ----

// Roles an admin can give a member. Like in the customer app, "owner" is never assigned or taken away.
var memberRoles = map[string]bool{"admin": true, "member": true, "viewer": true}

// lockMember returns the member's role and email (kept in the audit log so entries stay readable).
func lockMember(ctx context.Context, tx pgx.Tx, workspaceID, userID string) (role, email string, err error) {
	if uuidOrNil(workspaceID) == nil || uuidOrNil(userID) == nil {
		return "", "", ErrNotFound
	}
	err = tx.QueryRow(ctx, `
SELECT m.role::text, u.email FROM organization_memberships m JOIN users u ON u.id = m.user_id
WHERE m.organization_id = $1::uuid AND m.user_id = $2::uuid FOR UPDATE OF m`, workspaceID, userID).Scan(&role, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrNotFound
	}
	return role, email, err
}

// ChangeMemberRole sets a member's role in a workspace.
func (s *Service) ChangeMemberRole(ctx context.Context, actor Actor, workspaceID, userID, role, reason string) error {
	role = strings.ToLower(strings.TrimSpace(role))
	if !memberRoles[role] {
		return invalid("invalid_role", "Pick admin, member or viewer.")
	}
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	current, email, err := lockMember(ctx, tx, workspaceID, userID)
	if err != nil {
		return err
	}
	if current == "owner" {
		return conflict("owner", "The workspace owner's role can't be changed.")
	}
	if current == role {
		return conflict("unchanged", "They already have this role.")
	}
	if _, err := tx.Exec(ctx, `UPDATE organization_memberships SET role = $3::membership_role WHERE organization_id = $1::uuid AND user_id = $2::uuid`, workspaceID, userID, role); err != nil {
		return err
	}
	event := actor.target("workspace", "workspace.member_role", workspaceID, reason, map[string]string{"userId": userID, "email": email, "role": current}, map[string]string{"userId": userID, "email": email, "role": role})
	if err := RecordAudit(ctx, tx, event); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveMember takes a person out of a workspace. Their account and other workspaces are untouched.
func (s *Service) RemoveMember(ctx context.Context, actor Actor, workspaceID, userID, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	current, email, err := lockMember(ctx, tx, workspaceID, userID)
	if err != nil {
		return err
	}
	if current == "owner" {
		return conflict("owner", "The workspace owner can't be removed.")
	}
	if _, err := tx.Exec(ctx, `DELETE FROM organization_memberships WHERE organization_id = $1::uuid AND user_id = $2::uuid`, workspaceID, userID); err != nil {
		return err
	}
	event := actor.target("workspace", "workspace.member_remove", workspaceID, reason, map[string]string{"userId": userID, "email": email, "role": current}, nil)
	if err := RecordAudit(ctx, tx, event); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---- Invitations ----

type InvitationResendResult struct {
	EmailSent bool      `json:"emailSent"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ResendInvitation issues a new 7-day link and emails it, exactly like the customer app's Resend.
// The email goes out before the audit row is written, so a failed audit write can't undo a sent email;
// it is reported as an error instead.
func (s *Service) ResendInvitation(ctx context.Context, actor Actor, workspaceID, invitationID, reason string) (InvitationResendResult, error) {
	if s.invitations == nil {
		return InvitationResendResult{}, errors.New("invitations are not configured for the admin service")
	}
	reason, err := cleanReason(reason, false)
	if err != nil {
		return InvitationResendResult{}, err
	}
	if uuidOrNil(workspaceID) == nil || uuidOrNil(invitationID) == nil {
		return InvitationResendResult{}, ErrNotFound
	}
	inv, err := s.invitations.ResendInvitation(ctx, workspaceID, invitationID)
	if errors.Is(err, members.ErrInvitationNotFound) {
		return InvitationResendResult{}, &ActionError{Status: http.StatusConflict, Code: "not_pending", Message: "Only pending invitations can be resent."}
	}
	if err != nil {
		return InvitationResendResult{}, err
	}
	event := actor.target("workspace", "workspace.invitation_resend", workspaceID, reason, nil, map[string]any{"invitationId": invitationID, "email": inv.Email, "emailSent": inv.EmailSent})
	if err := RecordAudit(ctx, s.db, event); err != nil {
		return InvitationResendResult{}, err
	}
	return InvitationResendResult{EmailSent: inv.EmailSent, ExpiresAt: inv.ExpiresAt}, nil
}
