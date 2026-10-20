package envelope

import (
	"context"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
)

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/envelope -run Integration
func TestIntegrationWorkspaceDefaults(t *testing.T) {
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
	store := NewPostgresStore(pool)

	suffix := time.Now().Format("150405.000000")
	var userID, orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Defaults Test') RETURNING id::text`, "defaults-test-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Defaults Test', $1) RETURNING id::text`, "defaults-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID)
	})

	// Nothing saved: built-in defaults.
	e, err := store.Create(ctx, orgID, userID, CreateInput{Title: "Plain"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if e.Language != "en" || e.Timezone != "Etc/UTC" || !e.AutoReminders || e.FirstReminderDays != 3 || !e.NotifyOnView || !e.NotifyOnSign {
		t.Fatalf("built-in defaults: %+v", e)
	}

	set := func(section, config string) {
		if _, err := pool.Exec(ctx, `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, $2, $3::jsonb)
ON CONFLICT (organization_id, section) DO UPDATE SET config = EXCLUDED.config`, orgID, section, config); err != nil {
			t.Fatalf("save %s: %v", section, err)
		}
	}
	set("preferences", `{"language":"fr","timezone":"Europe/Paris","dateFormat":"DD/MM/YYYY","automaticReminders":false,"firstReminderDays":7,"repeatReminderDays":5}`)
	set("notifications", `{"recipientViewed":false,"recipientSigned":true}`)
	e, err = store.Create(ctx, orgID, userID, CreateInput{Title: "With preferences"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if e.Language != "fr" || e.Timezone != "Europe/Paris" || e.DateFormat != "DD/MM/YYYY" || e.AutoReminders || e.FirstReminderDays != 7 || e.RepeatReminderDays != 5 || e.NotifyOnView || !e.NotifyOnSign {
		t.Fatalf("saved preferences not applied: %+v", e)
	}

	// What the sender picks for this envelope wins over the workspace's preference.
	if e, err = store.Create(ctx, orgID, userID, CreateInput{Title: "Override", Language: "de"}); err != nil || e.Language != "de" || e.Timezone != "Europe/Paris" {
		t.Fatalf("explicit language: %+v %v", e, err)
	}

	// Nonsense (old free-text values, impossible numbers) falls back to the built-in defaults.
	set("preferences", `{"language":"English","timezone":"Mars/Olympus","firstReminderDays":500,"repeatReminderDays":"often"}`)
	e, err = store.Create(ctx, orgID, userID, CreateInput{Title: "Bad preferences"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if e.Language != "en" || e.Timezone != "Etc/UTC" || e.FirstReminderDays != 3 || e.RepeatReminderDays != 2 {
		t.Fatalf("invalid preferences should be ignored: %+v", e)
	}
}
