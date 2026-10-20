package admin

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
)

// BOOTSTRAP_SUPER_ADMINS grants super_admin once, leaves existing admins' roles alone and skips unknown emails.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationBootstrap(t *testing.T) {
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
	s := NewService(pool)

	suffix := time.Now().Format("150405.000000")
	fresh, existing, unknown := "bootstrap-new-"+suffix+"@example.com", "bootstrap-old-"+suffix+"@example.com", "bootstrap-none-"+suffix+"@example.com"
	for _, email := range []string{fresh, existing} {
		if _, err := pool.Exec(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Bootstrap')`, email); err != nil {
			t.Fatalf("insert user: %v", err)
		}
	}
	if _, err := s.Grant(ctx, existing, RoleSupport, nil); err != nil {
		t.Fatalf("grant support: %v", err)
	}

	results := s.Bootstrap(ctx, []string{" " + fresh + " ", existing, unknown})
	if err := results[" "+fresh+" "]; err != nil {
		t.Fatalf("fresh: %v", err)
	}
	if _, ok := results[existing]; ok {
		t.Fatalf("existing admin should be skipped, got %v", results[existing])
	}
	if !errors.Is(results[unknown], ErrUserNotFound) {
		t.Fatalf("unknown: got %v, want ErrUserNotFound", results[unknown])
	}

	role := func(email string) string {
		var r string
		if err := pool.QueryRow(ctx, `SELECT a.role::text FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE u.email = $1`, email).Scan(&r); err != nil {
			t.Fatalf("role of %s: %v", email, err)
		}
		return r
	}
	if got := role(fresh); got != string(RoleSuperAdmin) {
		t.Fatalf("fresh role = %s, want super_admin", got)
	}
	if got := role(existing); got != string(RoleSupport) {
		t.Fatalf("existing role = %s, want support (unchanged)", got)
	}

	// A second start does nothing.
	if results := s.Bootstrap(ctx, []string{fresh}); len(results) != 0 {
		t.Fatalf("second run: %v", results)
	}
}
