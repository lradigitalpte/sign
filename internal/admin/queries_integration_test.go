package admin

import (
	"context"
	"os"
	"testing"

	"signing-platform/internal/database"
)

// Read-only checks of the admin queries against a real database with migrations applied.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationReadQueries(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()
	s := NewService(pool)

	stats, err := s.Stats(ctx, 30)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if len(stats.Activity) != 30 {
		t.Fatalf("Activity has %d days, want 30", len(stats.Activity))
	}
	if len(stats.Envelopes.ByStatus) != 5 {
		t.Fatalf("ByStatus = %v", stats.Envelopes.ByStatus)
	}

	workspaces, err := s.ListWorkspaces(ctx, "", "", "", Page{})
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if _, err := s.ListWorkspaces(ctx, "50%_\\x", "suspended", "business", Page{Number: 2, Size: 5}); err != nil {
		t.Fatalf("ListWorkspaces with filters: %v", err)
	}
	if len(workspaces.Items) > 0 {
		if _, err := s.GetWorkspace(ctx, workspaces.Items[0].ID); err != nil {
			t.Fatalf("GetWorkspace: %v", err)
		}
	}
	if _, err := s.GetWorkspace(ctx, "not-a-uuid"); err != ErrNotFound {
		t.Fatalf("GetWorkspace(bad id) = %v, want ErrNotFound", err)
	}

	users, err := s.ListUsers(ctx, "", "active", Page{})
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users.Items) > 0 {
		if _, err := s.GetUser(ctx, users.Items[0].ID); err != nil {
			t.Fatalf("GetUser: %v", err)
		}
	}
	if _, err := s.List(ctx); err != nil {
		t.Fatalf("List admins: %v", err)
	}
	if _, err := s.ResolveSubject(ctx, "user_does_not_exist"); err != ErrNotAdmin {
		t.Fatalf("ResolveSubject(unknown) = %v, want ErrNotAdmin", err)
	}
	t.Logf("stats: %d workspaces, %d users; listed %d workspaces, %d users", stats.Workspaces.Total, stats.Users.Total, workspaces.Total, users.Total)
}
