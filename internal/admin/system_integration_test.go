package admin

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"signing-platform/internal/database"
)

// Reads only. Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationSystemHealth(t *testing.T) {
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
	s := NewService(pool).WithSystem(SystemOptions{Environment: "development"})

	health, err := s.SystemHealth(ctx)
	if err != nil {
		t.Fatalf("system health: %v", err)
	}
	if health.Checks[0].Key != "database" || health.Checks[0].Status != healthOK {
		t.Fatalf("database check = %+v", health.Checks[0])
	}
	if len(health.Jobs) != len(jobCatalog) {
		t.Fatalf("got %d jobs, want %d", len(health.Jobs), len(jobCatalog))
	}
	if len(health.Storage.Files) != 4 || health.Storage.DatabaseBytes <= 0 {
		t.Fatalf("storage = %+v", health.Storage)
	}
	if health.Checks[len(health.Checks)-1].Key != "email_delivery" {
		t.Fatalf("email delivery check missing: %+v", health.Checks)
	}
	out, _ := json.MarshalIndent(health, "", "  ")
	t.Log(string(out))
}
