package admin

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
	"signing-platform/internal/identity"
	"signing-platform/internal/members"
)

// Suspension (and its enforcement), member changes, invitation resends, the audit log and admin
// management, on a throwaway workspace with an owner, a member and a pretend admin.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationManagement(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	s := NewService(pool).WithInvitations(members.NewService(pool))

	suffix := time.Now().Format("150405.000000")
	newUser := func(label string) string {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, label+"-"+suffix+"@example.com", "Manage "+label).Scan(&id); err != nil {
			t.Fatalf("insert %s: %v", label, err)
		}
		return id
	}
	adminID, ownerID, memberID := newUser("admin"), newUser("owner"), newUser("member")
	var orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Manage Test', $1) RETURNING id::text`, "manage-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, adminID},
			{`DELETE FROM platform_admins WHERE user_id = $1::uuid`, adminID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, orgID},
			{`DELETE FROM users WHERE id = $1::uuid`, adminID},
			{`DELETE FROM users WHERE id = $1::uuid`, ownerID},
			{`DELETE FROM users WHERE id = $1::uuid`, memberID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup %q: %v", step.sql, err)
			}
		}
	})
	if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner'), ($1::uuid, $3::uuid, 'member')`, orgID, ownerID, memberID); err != nil {
		t.Fatalf("insert memberships: %v", err)
	}
	actor := Actor{Admin: Admin{UserID: adminID, Email: "admin-" + suffix + "@example.com"}, IPAddress: "127.0.0.1", UserAgent: "test"}
	var actionErr *ActionError
	wantCode := func(err error, code string) {
		t.Helper()
		if !errors.As(err, &actionErr) || actionErr.Code != code {
			t.Fatalf("got %v, want %s", err, code)
		}
	}
	store := identity.NewPostgresStore(pool)

	// Workspace suspension, and what the customer API sees.
	_, err = s.SuspendWorkspace(ctx, actor, orgID, "")
	wantCode(err, "reason_required")
	if _, err := s.SuspendWorkspace(ctx, actor, orgID, "chargeback fraud"); err != nil {
		t.Fatalf("SuspendWorkspace: %v", err)
	}
	_, err = s.SuspendWorkspace(ctx, actor, orgID, "again")
	wantCode(err, "already_suspended")
	if got, err := store.Suspension(ctx, memberID, orgID); err != nil || !got.Workspace || got.User {
		t.Fatalf("Suspension after workspace suspend = %+v, %v", got, err)
	}
	if _, err := s.UnsuspendWorkspace(ctx, actor, orgID, "resolved with the customer"); err != nil {
		t.Fatalf("UnsuspendWorkspace: %v", err)
	}
	if got, _ := store.Suspension(ctx, memberID, orgID); got.Workspace {
		t.Fatal("workspace still suspended after unsuspend")
	}

	// User suspension and its guards.
	_, err = s.SuspendUser(ctx, actor, adminID, "x")
	wantCode(err, "self")
	if _, err := pool.Exec(ctx, `INSERT INTO platform_admins (user_id, role) VALUES ($1::uuid, 'support')`, ownerID); err != nil {
		t.Fatal(err)
	}
	_, err = s.SuspendUser(ctx, actor, ownerID, "x")
	wantCode(err, "is_admin")
	if _, err := pool.Exec(ctx, `DELETE FROM platform_admins WHERE user_id = $1::uuid`, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SuspendUser(ctx, actor, memberID, "spam"); err != nil {
		t.Fatalf("SuspendUser: %v", err)
	}
	if got, _ := store.Suspension(ctx, memberID, orgID); !got.User {
		t.Fatal("user not suspended")
	}
	if _, err := s.UnsuspendUser(ctx, actor, memberID, "appeal accepted"); err != nil {
		t.Fatalf("UnsuspendUser: %v", err)
	}

	// Members.
	wantCode(s.ChangeMemberRole(ctx, actor, orgID, ownerID, "admin", "x"), "owner")
	wantCode(s.ChangeMemberRole(ctx, actor, orgID, memberID, "owner", "x"), "invalid_role")
	wantCode(s.ChangeMemberRole(ctx, actor, orgID, memberID, "member", "x"), "unchanged")
	if err := s.ChangeMemberRole(ctx, actor, orgID, memberID, "viewer", "read-only reviewer"); err != nil {
		t.Fatalf("ChangeMemberRole: %v", err)
	}
	wantCode(s.RemoveMember(ctx, actor, orgID, ownerID, "x"), "owner")
	if err := s.RemoveMember(ctx, actor, orgID, memberID, "left the company"); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}
	if err := s.RemoveMember(ctx, actor, orgID, memberID, "again"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("RemoveMember twice = %v, want ErrNotFound", err)
	}

	// Invitations: an expired pending invitation gets a new 7-day link. No mailer is set up here.
	var invitationID string
	if err := pool.QueryRow(ctx, `INSERT INTO organization_invitations (organization_id, email, token, invited_by, expires_at) VALUES ($1::uuid, $2, $3, $4::uuid, now() - interval '1 day') RETURNING id::text`,
		orgID, "invitee-"+suffix+"@example.com", "manage-test-token-"+suffix, ownerID).Scan(&invitationID); err != nil {
		t.Fatalf("insert invitation: %v", err)
	}
	resent, err := s.ResendInvitation(ctx, actor, orgID, invitationID, "")
	if err != nil || resent.EmailSent || resent.ExpiresAt.Before(time.Now().Add(6*24*time.Hour)) {
		t.Fatalf("ResendInvitation = %+v, %v", resent, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE organization_invitations SET status = 'revoked' WHERE id = $1::uuid`, invitationID); err != nil {
		t.Fatal(err)
	}
	_, err = s.ResendInvitation(ctx, actor, orgID, invitationID, "")
	wantCode(err, "not_pending")

	// Audit log: everything above, filterable by target and searchable by reason.
	byTarget, err := s.ListAudit(ctx, AuditFilter{TargetType: "workspace", TargetID: orgID}, Page{})
	if err != nil || byTarget.Total != 5 {
		t.Fatalf("ListAudit by workspace = %d, %v", byTarget.Total, err)
	}
	if byTarget.Items[0].Action != "workspace.invitation_resend" || byTarget.Items[0].TargetLabel == nil || *byTarget.Items[0].TargetLabel != "Manage Test" {
		t.Fatalf("newest workspace entry = %+v", byTarget.Items[0])
	}
	if found, err := s.ListAudit(ctx, AuditFilter{Query: "appeal accepted", AdminID: adminID}, Page{}); err != nil || found.Total != 1 || found.Items[0].Action != "user.unsuspend" {
		t.Fatalf("ListAudit search = %+v, %v", found, err)
	}

	// Admin management guards.
	_, err = s.GrantFromApp(ctx, actor, actor.Admin.Email, RoleSupport, "x")
	wantCode(err, "self")
	_, err = s.GrantFromApp(ctx, actor, "nobody-"+suffix+"@example.com", RoleSupport, "x")
	wantCode(err, "user_not_found")
	if _, err := s.GrantFromApp(ctx, actor, "owner-"+suffix+"@example.com", RoleReadOnly, ""); err == nil {
		t.Fatal("GrantFromApp without a reason succeeded")
	}
	if _, err := s.GrantFromApp(ctx, actor, "owner-"+suffix+"@example.com", RoleReadOnly, "joined support"); err != nil {
		t.Fatalf("GrantFromApp: %v", err)
	}
	wantCode(s.RevokeFromApp(ctx, actor, adminID, "x"), "self")
	wantCode(s.RevokeFromApp(ctx, actor, ownerID, ""), "reason_required")
	if err := s.RevokeFromApp(ctx, actor, ownerID, "test over"); err != nil {
		t.Fatalf("RevokeFromApp: %v", err)
	}
}
