package admin

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
)

// Builds jobs in every state on a throwaway envelope, retries them, then deletes everything.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationEmailJobs(t *testing.T) {
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
	var userID, orgID, envelopeID, recipientID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Jobs Test') RETURNING id::text`, "jobs-test-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Jobs Test', $1) RETURNING id::text`, "jobs-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, userID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, orgID},
			{`DELETE FROM users WHERE id = $1::uuid`, userID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup %q: %v", step.sql, err)
			}
		}
	})
	if err := pool.QueryRow(ctx, `INSERT INTO envelopes (organization_id, created_by, title, status, sent_at) VALUES ($1::uuid, $2::uuid, 'Jobs test envelope', 'in_progress', now()) RETURNING id::text`, orgID, userID).Scan(&envelopeID); err != nil {
		t.Fatalf("insert envelope: %v", err)
	}
	recipient := "jobs-signer-" + suffix + "@example.com"
	if err := pool.QueryRow(ctx, `INSERT INTO recipients (envelope_id, name, email, status, sent_at) VALUES ($1::uuid, 'Signer', $2, 'sent', now()) RETURNING id::text`, envelopeID, recipient).Scan(&recipientID); err != nil {
		t.Fatalf("insert recipient: %v", err)
	}

	// Attempts are at the limit where it matters, so a running worker leaves these jobs alone during the test.
	fixtures := map[string]string{
		"gave_up":   `'invitation', 'failed', 8, now() - interval '1 minute', now()`,
		"permanent": `'reminder', 'failed', 1, now() + interval '100 years', now()`,
		"retrying":  `'reminder', 'failed', 2, now() + interval '1 hour', now()`,
		"stuck":     `'invitation', 'processing', 8, now(), now() - interval '10 minutes'`,
		"sent":      `'invitation', 'sent', 1, now(), now()`,
		"wrongkind": `'completion', 'failed', 8, now(), now()`,
	}
	ids := map[string]string{}
	for name, values := range fixtures {
		var id string
		if err := pool.QueryRow(ctx, `INSERT INTO notification_jobs (envelope_id, recipient_id, token_ciphertext, kind, status, attempts, available_at, updated_at)
VALUES ($1::uuid, $2::uuid, decode('00', 'hex'), `+values+`) RETURNING id::text`, envelopeID, recipientID).Scan(&id); err != nil {
			t.Fatalf("insert %s job: %v", name, err)
		}
		ids[name] = id
	}

	attention, err := s.ListEmailJobs(ctx, recipient, "attention", "", Page{})
	if err != nil {
		t.Fatalf("ListEmailJobs: %v", err)
	}
	if attention.Total != 4 || attention.Items[0].State != "gave_up" {
		t.Fatalf("attention: total %d, first %+v", attention.Total, attention.Items)
	}
	if attention.Counts.GaveUp < 3 || attention.Counts.Stuck < 1 || attention.Counts.Retrying < 1 {
		t.Fatalf("counts = %+v", attention.Counts)
	}
	all, err := s.ListEmailJobs(ctx, envelopeID, "", "", Page{})
	if err != nil || all.Total != 6 {
		t.Fatalf("ListEmailJobs by envelope ID = %d, %v", all.Total, err)
	}
	states := map[string]string{}
	for _, job := range all.Items {
		states[job.ID] = job.State
	}
	for name, want := range map[string]string{"gave_up": "gave_up", "permanent": "gave_up", "retrying": "retrying", "stuck": "stuck", "sent": "sent", "wrongkind": "gave_up"} {
		if states[ids[name]] != want {
			t.Errorf("%s job state = %q, want %q", name, states[ids[name]], want)
		}
	}

	actor := Actor{Admin: Admin{UserID: userID}, IPAddress: "127.0.0.1", UserAgent: "test"}
	var actionErr *ActionError
	if _, err := s.RetryEmailJob(ctx, actor, ids["sent"], ""); !errors.As(err, &actionErr) {
		t.Fatalf("retry sent job = %v, want ActionError", err)
	}
	if _, err := s.RetryEmailJob(ctx, actor, ids["wrongkind"], ""); !errors.As(err, &actionErr) {
		t.Fatalf("retry completion for unfinished envelope = %v, want ActionError", err)
	}
	retried, err := s.RetryEmailJob(ctx, actor, ids["gave_up"], "provider outage is over")
	if err != nil || retried.State != "queued" {
		t.Fatalf("RetryEmailJob = %+v, %v", retried, err)
	}

	// The rest of the database may hold real stuck jobs, so only check this test's share.
	bulk, err := s.RetryStuckEmailJobs(ctx, actor, "")
	if err != nil || bulk.Retried < 2 || bulk.Skipped < 1 {
		t.Fatalf("RetryStuckEmailJobs = %+v, %v", bulk, err)
	}
	// A running worker may already have picked a requeued job up, which makes its attempts 1.
	var requeued int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM notification_jobs WHERE id = ANY($1::uuid[]) AND attempts <= 1`, []string{ids["gave_up"], ids["permanent"], ids["stuck"]}).Scan(&requeued); err != nil || requeued != 3 {
		t.Fatalf("requeued jobs = %d, %v", requeued, err)
	}

	detail, err := s.GetEmailJob(ctx, ids["gave_up"])
	if err != nil || len(detail.AdminActions) != 1 {
		t.Fatalf("GetEmailJob = %d admin actions, %v", len(detail.AdminActions), err)
	}
}
