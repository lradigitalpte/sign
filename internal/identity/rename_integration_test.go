package identity

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
)

type fakeRenameDirectory struct {
	renamed map[string]string
	refuse  bool
}

func (f *fakeRenameDirectory) RenameOrganization(_ context.Context, subject, name string) error {
	if f.refuse {
		return errors.New("name not allowed")
	}
	f.renamed[subject] = name
	return nil
}

func (f *fakeRenameDirectory) DeleteUser(context.Context, string) error { return nil }

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/identity -run Integration
func TestIntegrationRenameWorkspace(t *testing.T) {
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

	suffix := time.Now().Format("150405.000000")
	var personalID, teamID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Personal Test', $1) RETURNING id::text`, "rename-personal-"+suffix).Scan(&personalID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Team Test', $1) RETURNING id::text`, "rename-team-"+suffix).Scan(&teamID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	subject := "org_rename_test_" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO organization_auth_identities (organization_id, provider, provider_subject) VALUES ($1::uuid, 'workos', $2)`, teamID, subject); err != nil {
		t.Fatalf("insert identity: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = ANY($1::uuid[])`, []string{personalID, teamID})
	})

	rename := func(directory DirectoryAdmin, id, name string) (bool, error) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		defer tx.Rollback(ctx)
		_, synced, err := RenameWorkspace(ctx, tx, directory, id, name)
		if err == nil {
			if err := tx.Commit(ctx); err != nil {
				t.Fatalf("commit: %v", err)
			}
		}
		return synced, err
	}
	nameOf := func(id string) (string, bool) {
		var name string
		var locked bool
		if err := pool.QueryRow(ctx, `SELECT name, name_locked_at IS NOT NULL FROM organizations WHERE id = $1::uuid`, id).Scan(&name, &locked); err != nil {
			t.Fatalf("load: %v", err)
		}
		return name, locked
	}

	// Personal workspace: renamed locally and locked, no WorkOS needed.
	if synced, err := rename(nil, personalID, "  Henry & Co  "); err != nil || synced {
		t.Fatalf("personal rename: synced %v, err %v", synced, err)
	}
	if name, locked := nameOf(personalID); name != "Henry & Co" || !locked {
		t.Fatalf("personal workspace: %q locked=%v", name, locked)
	}
	if _, err := rename(nil, personalID, "Henry & Co"); !errors.Is(err, ErrNameUnchanged) {
		t.Fatalf("same name: %v", err)
	}
	if _, err := rename(nil, personalID, "   "); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("blank name: %v", err)
	}

	// WorkOS organization: needs WorkOS, renames it there first.
	if _, err := rename(nil, teamID, "Team Renamed"); !errors.Is(err, ErrRenameUnavailable) {
		t.Fatalf("without WorkOS: %v", err)
	}
	refusing := &fakeRenameDirectory{renamed: map[string]string{}, refuse: true}
	var rejected *RenameRejectedError
	if _, err := rename(refusing, teamID, "Team Renamed"); !errors.As(err, &rejected) {
		t.Fatalf("WorkOS refused: %v", err)
	}
	if name, _ := nameOf(teamID); name != "Team Test" {
		t.Fatalf("a refused rename changed the name to %q", name)
	}
	directory := &fakeRenameDirectory{renamed: map[string]string{}}
	if synced, err := rename(directory, teamID, "Team Renamed"); err != nil || !synced {
		t.Fatalf("WorkOS rename: synced %v, err %v", synced, err)
	}
	if name, locked := nameOf(teamID); name != "Team Renamed" || locked || directory.renamed[subject] != "Team Renamed" {
		t.Fatalf("WorkOS workspace: %q locked=%v workos=%q", name, locked, directory.renamed[subject])
	}
	if syncs, err := SyncsNameToWorkOS(ctx, pool, teamID); err != nil || !syncs {
		t.Fatalf("SyncsNameToWorkOS(team) = %v, %v", syncs, err)
	}
	if syncs, err := SyncsNameToWorkOS(ctx, pool, personalID); err != nil || syncs {
		t.Fatalf("SyncsNameToWorkOS(personal) = %v, %v", syncs, err)
	}
}
