package admin

import (
	"context"
	"crypto/rand"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/database"
	"signing-platform/internal/send"
)

func randomToken() (send.Token, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return send.Token{}, err
	}
	return send.Token{Raw: string(raw), Hash: raw, Ciphertext: raw}, nil
}

// Exercises resend, extend and void on a throwaway envelope, then deletes it.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationEnvelopeActions(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	// Registered first so it runs last: cleanups run in reverse order, and a deferred Close would run before them.
	t.Cleanup(pool.Close)
	s := NewService(pool).WithSigningLinks(randomToken)

	suffix := time.Now().Format("150405.000000")
	var userID, orgID, envelopeID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Admin Test') RETURNING id::text`, "admin-test-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Admin Test', $1) RETURNING id::text`, "admin-test-"+suffix).Scan(&orgID); err != nil {
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
	if err := pool.QueryRow(ctx, `INSERT INTO envelopes (organization_id, created_by, title, status, expires_at, sent_at) VALUES ($1::uuid, $2::uuid, 'Admin test envelope', 'in_progress', now() + interval '2 days', now()) RETURNING id::text`, orgID, userID).Scan(&envelopeID); err != nil {
		t.Fatalf("insert envelope: %v", err)
	}
	recipient := "signer-" + suffix + "@example.com"
	if _, err := pool.Exec(ctx, `INSERT INTO recipients (envelope_id, name, email, status, sent_at) VALUES ($1::uuid, 'Signer', $2, 'sent', now())`, envelopeID, recipient); err != nil {
		t.Fatalf("insert recipient: %v", err)
	}
	actor := Actor{Admin: Admin{UserID: userID}, IPAddress: "127.0.0.1", UserAgent: "test"}

	found, err := s.ListEnvelopes(ctx, recipient, "in_progress", orgID, Page{})
	if err != nil || found.Total != 1 || found.Items[0].RecipientCount != 1 {
		t.Fatalf("ListEnvelopes by recipient = %+v, %v", found, err)
	}
	if byID, err := s.ListEnvelopes(ctx, envelopeID, "", "", Page{}); err != nil || byID.Total != 1 {
		t.Fatalf("ListEnvelopes by ID = %+v, %v", byID, err)
	}

	resent, err := s.ResendEnvelope(ctx, actor, envelopeID, "")
	if err != nil || resent.RemindersQueued != 1 {
		t.Fatalf("ResendEnvelope = %+v, %v", resent, err)
	}

	var actionErr *ActionError
	if _, err := s.ExtendEnvelope(ctx, actor, envelopeID, time.Now().Add(24*time.Hour), "earlier"); !errors.As(err, &actionErr) {
		t.Fatalf("ExtendEnvelope(earlier than current) = %v, want ActionError", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE envelopes SET expires_at = NULL WHERE id = $1::uuid`, envelopeID); err != nil {
		t.Fatalf("clear expiry: %v", err)
	}
	if _, err := s.ExtendEnvelope(ctx, actor, envelopeID, time.Now().Add(10*24*time.Hour), "no expiry"); !errors.As(err, &actionErr) || actionErr.Code != "no_expiry" {
		t.Fatalf("ExtendEnvelope(no expiry) = %v, want no_expiry", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE envelopes SET status = 'expired', expires_at = now() - interval '1 hour' WHERE id = $1::uuid`, envelopeID); err != nil {
		t.Fatalf("expire: %v", err)
	}
	extended, err := s.ExtendEnvelope(ctx, actor, envelopeID, time.Now().Add(10*24*time.Hour), "signer asked for more time")
	if err != nil || !extended.Reopened {
		t.Fatalf("ExtendEnvelope(expired) = %+v, %v", extended, err)
	}
	var tokensShort int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM signing_tokens t JOIN recipients r ON r.id = t.recipient_id WHERE r.envelope_id = $1::uuid AND t.expires_at < $2`, envelopeID, extended.ExpiresAt).Scan(&tokensShort); err != nil || tokensShort != 0 {
		t.Fatalf("tokens expiring before the new date = %d, %v", tokensShort, err)
	}

	if err := s.VoidEnvelope(ctx, actor, envelopeID, "  "); !errors.As(err, &actionErr) || actionErr.Code != "reason_required" {
		t.Fatalf("VoidEnvelope(no reason) = %v, want reason_required", err)
	}
	if err := s.VoidEnvelope(ctx, actor, envelopeID, "customer asked"); err != nil {
		t.Fatalf("VoidEnvelope: %v", err)
	}
	if err := s.VoidEnvelope(ctx, actor, envelopeID, "again"); !errors.As(err, &actionErr) || actionErr.Code != "not_in_progress" {
		t.Fatalf("VoidEnvelope(twice) = %v, want not_in_progress", err)
	}

	detail, err := s.GetEnvelope(ctx, envelopeID)
	if err != nil {
		t.Fatalf("GetEnvelope: %v", err)
	}
	if detail.Status != "voided" || len(detail.AdminActions) != 3 || len(detail.Jobs) != 1 {
		t.Fatalf("detail: status %s, %d admin actions, %d jobs", detail.Status, len(detail.AdminActions), len(detail.Jobs))
	}
	support := 0
	for _, event := range detail.Events {
		if event.Metadata["support"] == true {
			support++
		}
	}
	if support != 3 {
		t.Fatalf("customer timeline has %d support events, want 3", support)
	}
	var unrevoked int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM signing_tokens t JOIN recipients r ON r.id = t.recipient_id WHERE r.envelope_id = $1::uuid AND t.revoked_at IS NULL`, envelopeID).Scan(&unrevoked); err != nil || unrevoked != 0 {
		t.Fatalf("unrevoked tokens after void = %d, %v", unrevoked, err)
	}
}
