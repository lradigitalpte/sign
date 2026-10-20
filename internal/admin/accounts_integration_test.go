package admin

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
	"signing-platform/internal/identity"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/storage"
)

// fakeDirectory records WorkOS calls and can be told to refuse them.
type fakeDirectory struct {
	renamed map[string]string
	deleted []string
	fail    bool
}

func (f *fakeDirectory) RenameOrganization(_ context.Context, subject, name string) error {
	if f.fail {
		return errors.New("WorkOS is down")
	}
	f.renamed[subject] = name
	return nil
}

func (f *fakeDirectory) DeleteUser(_ context.Context, subject string) error {
	if f.fail {
		return errors.New("WorkOS is down")
	}
	f.deleted = append(f.deleted, subject)
	return nil
}

// Workspace renames and a person deleting their own account, on throwaway records.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationRenameAndAccountDeletion(t *testing.T) {
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
	directory := &fakeDirectory{renamed: map[string]string{}}
	store := &memoryStore{objects: map[string][]byte{}}
	life := lifecycle.New(pool, storage.Static(store), nil).WithDirectory(directory)
	s := NewService(pool).WithLifecycle(life).WithDirectory(directory)

	suffix := time.Now().Format("150405.000000")
	newUser := func(label string) string {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id::text`, label+"-"+suffix+"@example.com", "Acct "+label).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	newOrg := func(name, slug string) string {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id::text`, name, slug+"-"+suffix).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	adminID, leaverID, colleagueID := newUser("admin"), newUser("leaver"), newUser("colleague")
	personalID, workosOrgID, sharedID := newOrg("Leaver's Workspace", "personal-acct"), newOrg("Acme Inc", "workos-acct"), newOrg("Shared Co", "shared-acct")
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, adminID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, personalID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, workosOrgID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, sharedID},
			{`DELETE FROM users WHERE id = $1::uuid`, adminID},
			{`DELETE FROM users WHERE id = $1::uuid`, leaverID},
			{`DELETE FROM users WHERE id = $1::uuid`, colleagueID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup %q: %v", step.sql, err)
			}
		}
	})
	mustExec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	mustExec(`INSERT INTO organization_auth_identities (organization_id, provider, provider_subject) VALUES ($1::uuid, 'workos', $2), ($3::uuid, 'workos', $4)`,
		personalID, "personal:user_leaver_"+suffix, workosOrgID, "org_acme_"+suffix)
	mustExec(`INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email) VALUES ($1::uuid, 'workos', $2, 'x@example.com')`, leaverID, "user_leaver_"+suffix)
	mustExec(`INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner'), ($3::uuid, $2::uuid, 'owner'), ($3::uuid, $4::uuid, 'member'), ($5::uuid, $4::uuid, 'owner'), ($5::uuid, $2::uuid, 'member')`,
		personalID, leaverID, sharedID, colleagueID, workosOrgID)
	actor := Actor{Admin: Admin{UserID: adminID}, IPAddress: "127.0.0.1", UserAgent: "test"}
	var actionErr *ActionError

	// ---- Rename ----
	got, err := s.RenameWorkspace(ctx, actor, workosOrgID, "Acme Corporation", "Legal name changed")
	if err != nil || !got.SyncedToWorkOS || directory.renamed["org_acme_"+suffix] != "Acme Corporation" {
		t.Fatalf("WorkOS rename = %+v, %v (renamed %v)", got, err, directory.renamed)
	}
	directory.fail = true
	if _, err := s.RenameWorkspace(ctx, actor, workosOrgID, "Should Not Stick", "x"); !errors.As(err, &actionErr) || actionErr.Code != "workos_failed" {
		t.Fatalf("rename while WorkOS fails = %v", err)
	}
	directory.fail = false
	var name string
	_ = pool.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1::uuid`, workosOrgID).Scan(&name)
	if name != "Acme Corporation" {
		t.Fatalf("name after a refused rename = %q", name)
	}
	if got, err := s.RenameWorkspace(ctx, actor, personalID, "Leaver's Studio", "Customer asked"); err != nil || got.SyncedToWorkOS {
		t.Fatalf("personal rename = %+v, %v", got, err)
	}
	// A personal workspace's name now survives sign-in, which used to rewrite it every time.
	if _, err := identity.NewPostgresStore(pool).Upsert(ctx, "workos",
		identity.ProviderUser{Subject: "user_leaver_" + suffix, Email: "leaver-" + suffix + "@example.com", Name: "Acct leaver"},
		identity.ProviderOrganization{Subject: "personal:user_leaver_" + suffix, Name: "Acct leaver's Workspace", Role: "owner", Personal: true}); err != nil {
		t.Fatalf("sign-in sync: %v", err)
	}
	_ = pool.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1::uuid`, personalID).Scan(&name)
	if name != "Leaver's Studio" {
		t.Fatalf("personal workspace name after sign-in = %q, want the locked name", name)
	}

	// ---- Account deletion ----
	var shared *lifecycle.SharedWorkspacesError
	if _, err := life.RequestAccountDeletion(ctx, leaverID, "leaver@example.com"); !errors.As(err, &shared) || len(shared.Names) != 1 || shared.Names[0] != "Shared Co" {
		t.Fatalf("deletion while owning a shared workspace = %v", err)
	}
	mustExec(`DELETE FROM organization_memberships WHERE organization_id = $1::uuid AND user_id = $2::uuid`, sharedID, colleagueID)
	mustExec(`INSERT INTO platform_admins (user_id, role) VALUES ($1::uuid, 'read_only')`, leaverID)
	if _, err := life.RequestAccountDeletion(ctx, leaverID, "leaver@example.com"); !errors.Is(err, lifecycle.ErrPlatformAdmin) {
		t.Fatalf("deletion as platform admin = %v", err)
	}
	mustExec(`DELETE FROM platform_admins WHERE user_id = $1::uuid`, leaverID)
	request, err := life.RequestAccountDeletion(ctx, leaverID, "leaver@example.com")
	if err != nil || request.ScheduledFor.Before(time.Now().Add(29*24*time.Hour)) {
		t.Fatalf("RequestAccountDeletion = %+v, %v", request, err)
	}
	if detail, err := s.GetUser(ctx, leaverID); err != nil || detail.AccountDeletion == nil {
		t.Fatalf("user detail shows no pending deletion: %v", err)
	}
	done, err := s.RunAccountDeletionNow(ctx, actor, request.ID, "Confirmed by email")
	if err != nil || done.Status != "completed" || done.WorkspacesDeleted == nil || *done.WorkspacesDeleted != 2 || done.Warning != nil {
		t.Fatalf("RunAccountDeletionNow = %+v, %v", done, err)
	}
	var orgsLeft int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM organizations WHERE id = ANY($1::uuid[])`, []string{personalID, sharedID, workosOrgID}).Scan(&orgsLeft)
	if orgsLeft != 1 {
		t.Fatalf("workspaces left = %d, want only the one they were a member of", orgsLeft)
	}
	var email string
	var deleted bool
	var memberships, identities int
	_ = pool.QueryRow(ctx, `SELECT email, deleted_at IS NOT NULL, (SELECT count(*) FROM organization_memberships WHERE user_id = $1::uuid), (SELECT count(*) FROM auth_identities WHERE user_id = $1::uuid) FROM users WHERE id = $1::uuid`, leaverID).
		Scan(&email, &deleted, &memberships, &identities)
	if !deleted || email != "deleted+"+leaverID+"@deleted.invalid" || memberships != 0 || identities != 0 {
		t.Fatalf("account after deletion: %s deleted=%v memberships=%d identities=%d", email, deleted, memberships, identities)
	}
	if len(directory.deleted) != 1 || directory.deleted[0] != "user_leaver_"+suffix {
		t.Fatalf("WorkOS deletions = %v", directory.deleted)
	}
	if list, err := s.ListAccountDeletions(ctx, "completed", Page{}); err != nil || list.Total == 0 {
		t.Fatalf("ListAccountDeletions = %+v, %v", list, err)
	}
}
