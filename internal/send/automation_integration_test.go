package send_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"signing-platform/internal/database"
	"signing-platform/internal/envelope"
	"signing-platform/internal/notify"
	"signing-platform/internal/send"
	"signing-platform/internal/signing"
)

// Runs against a disposable PostgreSQL database: SIGNET_TEST_DATABASE_URL=postgres://... go test ./internal/send/
// Never point it at a database whose data you need.
func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("SIGNET_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("SIGNET_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool, "../../db/migrations"); err != nil {
		t.Fatal(err)
	}
	return pool
}

type fixture struct {
	envelopeID, signerID, senderEmail string
	tokenHash                         []byte
}

func seed(t *testing.T, db *pgxpool.Pool, passcode string, sentAgo time.Duration, expiresIn *time.Duration) fixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().Format("150405.000000000")
	var userID, orgID string
	f := fixture{senderEmail: "sender" + suffix + "@example.com"}
	must(t, db.QueryRow(ctx, `INSERT INTO users(email, name) VALUES($1, 'Sam Sender') RETURNING id::text`, f.senderEmail).Scan(&userID))
	must(t, db.QueryRow(ctx, `INSERT INTO organizations(name, slug) VALUES('Acme', $1) RETURNING id::text`, "acme-"+suffix).Scan(&orgID))
	var hash *string
	if passcode != "" {
		value, err := bcrypt.GenerateFromPassword([]byte(passcode), bcrypt.MinCost)
		must(t, err)
		text := string(value)
		hash = &text
	}
	var expiresAt *time.Time
	if expiresIn != nil {
		value := time.Now().Add(*expiresIn)
		expiresAt = &value
	}
	must(t, db.QueryRow(ctx, `INSERT INTO envelopes(organization_id, created_by, title, status, sent_at, auto_reminders, first_reminder_days, repeat_reminder_days, require_passcode, passcode, expires_at)
VALUES($1::uuid,$2::uuid,'NDA','in_progress',now(),true,3,2,$3,$4,$5) RETURNING id::text`, orgID, userID, hash != nil, hash, expiresAt).Scan(&f.envelopeID))
	must(t, db.QueryRow(ctx, `INSERT INTO recipients(envelope_id, name, email, role, status, signing_order, sent_at)
VALUES($1::uuid,'Alex Signer','alex@example.com','signer','sent',1,now()-make_interval(secs => $2)) RETURNING id::text`, f.envelopeID, sentAgo.Seconds()).Scan(&f.signerID))
	f.tokenHash = []byte("token-" + suffix)
	_, err := db.Exec(ctx, `INSERT INTO signing_tokens(recipient_id, token_hash, expires_at) VALUES($1::uuid,$2,now()+interval '30 days')`, f.signerID, f.tokenHash)
	must(t, err)
	return f
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func fakeTokens() func() (send.Token, error) {
	n := 0
	return func() (send.Token, error) {
		n++
		raw := time.Now().Format("150405.000000000") + string(rune('a'+n))
		return send.Token{Raw: raw, Hash: []byte("hash-" + raw), Ciphertext: []byte("cipher-" + raw)}, nil
	}
}

func countJobs(t *testing.T, db *pgxpool.Pool, envelopeID, kind string) int {
	t.Helper()
	var count int
	must(t, db.QueryRow(context.Background(), `SELECT count(*) FROM notification_jobs WHERE envelope_id=$1::uuid AND kind=$2`, envelopeID, kind).Scan(&count))
	return count
}

func TestAutomaticRemindersFollowSchedule(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	due := seed(t, db, "", 4*24*time.Hour, nil)
	notYet := seed(t, db, "", 2*24*time.Hour, nil)
	scheduler := send.NewScheduler(db, fakeTokens(), nil)

	if _, err := scheduler.QueueDueReminders(ctx); err != nil {
		t.Fatal(err)
	}
	if got := countJobs(t, db, due.envelopeID, "reminder"); got != 1 {
		t.Fatalf("due envelope reminders=%d, want 1", got)
	}
	if got := countJobs(t, db, notYet.envelopeID, "reminder"); got != 0 {
		t.Fatalf("not-yet-due envelope reminders=%d, want 0", got)
	}

	// Running again straight away must not send a second reminder; the repeat interval has not passed.
	if _, err := scheduler.QueueDueReminders(ctx); err != nil {
		t.Fatal(err)
	}
	if got := countJobs(t, db, due.envelopeID, "reminder"); got != 1 {
		t.Fatalf("reminders after second run=%d, want 1", got)
	}

	// Two days later the repeat reminder is due.
	_, err := db.Exec(ctx, `UPDATE recipients SET last_reminded_at = now() - interval '2 days 1 minute' WHERE id=$1::uuid`, due.signerID)
	must(t, err)
	if _, err := scheduler.QueueDueReminders(ctx); err != nil {
		t.Fatal(err)
	}
	if got := countJobs(t, db, due.envelopeID, "reminder"); got != 2 {
		t.Fatalf("reminders after repeat interval=%d, want 2", got)
	}
}

func TestExpiredEnvelopes(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	past := -time.Hour
	f := seed(t, db, "", time.Hour, &past)

	session, err := signing.NewPostgresStore(db).Resolve(ctx, f.tokenHash)
	must(t, err)
	if session.Envelope.Status != "expired" {
		t.Fatalf("status before sweep=%q, want expired", session.Envelope.Status)
	}

	scheduler := send.NewScheduler(db, fakeTokens(), nil)
	if _, err := scheduler.ExpireOverdue(ctx); err != nil {
		t.Fatal(err)
	}
	var status string
	must(t, db.QueryRow(ctx, `SELECT status::text FROM envelopes WHERE id=$1::uuid`, f.envelopeID).Scan(&status))
	if status != "expired" {
		t.Fatalf("status after sweep=%q", status)
	}
	if _, err := scheduler.QueueDueReminders(ctx); err != nil {
		t.Fatal(err)
	}
	if got := countJobs(t, db, f.envelopeID, "reminder"); got != 0 {
		t.Fatalf("expired envelope got %d reminders", got)
	}
}

func TestPasscodeLockoutAndUnlock(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	f := seed(t, db, "4821", time.Hour, nil)
	store := signing.NewPostgresStore(db)

	session, err := store.Resolve(ctx, f.tokenHash)
	must(t, err)
	service := signing.NewService(store, nil)
	locked, err := service.Session(ctx, f.tokenHash)
	must(t, err)
	if !locked.Locked || len(locked.Documents) != 0 {
		t.Fatalf("expected locked session, got %#v", locked)
	}

	for i := 1; i <= 4; i++ {
		lockedUntil, err := store.RecordPasscodeFailure(ctx, session.Recipient.ID, signing.AuditContext{})
		must(t, err)
		if lockedUntil != nil {
			t.Fatalf("locked after %d failures", i)
		}
	}
	lockedUntil, err := store.RecordPasscodeFailure(ctx, session.Recipient.ID, signing.AuditContext{})
	must(t, err)
	if lockedUntil == nil || lockedUntil.Before(time.Now().Add(14*time.Minute)) {
		t.Fatalf("expected a 15 minute lockout, got %v", lockedUntil)
	}
	if _, err := service.VerifyPasscode(ctx, f.tokenHash, "4821", signing.AuditContext{}); err != signing.ErrPasscodeLocked {
		t.Fatalf("verify during lockout error=%v", err)
	}

	_, err = db.Exec(ctx, `UPDATE recipients SET passcode_locked_until = now() - interval '1 second' WHERE id=$1::uuid`, f.signerID)
	must(t, err)
	unlocked, err := service.VerifyPasscode(ctx, f.tokenHash, "4821", signing.AuditContext{})
	must(t, err)
	if unlocked.Locked {
		t.Fatal("session still locked after the correct passcode")
	}

	// Once the session timeout passes without activity, the link locks again.
	_, err = db.Exec(ctx, `UPDATE signing_tokens SET last_used_at = now() - interval '2 hours' WHERE token_hash=$1`, f.tokenHash)
	must(t, err)
	relocked, err := service.Session(ctx, f.tokenHash)
	must(t, err)
	if !relocked.Locked {
		t.Fatal("session should lock again after the idle timeout")
	}
}

func TestSenderNotices(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	f := seed(t, db, "", time.Hour, nil)
	store := signing.NewPostgresStore(db)

	must(t, store.MarkViewed(ctx, f.signerID, signing.AuditContext{}))
	must(t, store.MarkViewed(ctx, f.signerID, signing.AuditContext{}))
	if got := countJobs(t, db, f.envelopeID, "sender_viewed"); got != 1 {
		t.Fatalf("viewed notices=%d, want 1", got)
	}
	must(t, store.Complete(ctx, f.signerID, signing.AuditContext{}))
	if got := countJobs(t, db, f.envelopeID, "sender_signed"); got != 1 {
		t.Fatalf("signed notices=%d, want 1", got)
	}

	invitation, err := notify.NewPostgresStore(db).LoadInvitation(ctx, notify.Job{EnvelopeID: f.envelopeID, RecipientID: f.signerID, Kind: "sender_signed"})
	must(t, err)
	if invitation.SenderEmail != f.senderEmail {
		t.Fatalf("sender email=%q", invitation.SenderEmail)
	}

	off := seed(t, db, "", time.Hour, nil)
	_, err = db.Exec(ctx, `UPDATE envelopes SET notify_on_view=false WHERE id=$1::uuid`, off.envelopeID)
	must(t, err)
	must(t, store.MarkViewed(ctx, off.signerID, signing.AuditContext{}))
	if got := countJobs(t, db, off.envelopeID, "sender_viewed"); got != 0 {
		t.Fatalf("notice sent with notifications off: %d", got)
	}
}

func TestEnvelopeSettingsClearAndHashPasscode(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	var userID, orgID string
	suffix := time.Now().Format("150405.000000000")
	must(t, db.QueryRow(ctx, `INSERT INTO users(email, name) VALUES($1, 'Owner') RETURNING id::text`, "owner"+suffix+"@example.com").Scan(&userID))
	must(t, db.QueryRow(ctx, `INSERT INTO organizations(name, slug) VALUES('Acme', $1) RETURNING id::text`, "org-"+suffix).Scan(&orgID))
	service := envelope.NewService(envelope.NewPostgresStore(db))
	draft, err := service.Create(ctx, orgID, userID, envelope.CreateInput{Title: "Draft"})
	must(t, err)

	expires := time.Now().Add(72 * time.Hour)
	redirect := "https://example.com/thanks"
	passcode := "4821"
	require := true
	updated, err := service.Update(ctx, orgID, draft.ID, envelope.UpdateInput{ExpiresAt: &expires, RedirectURL: &redirect, Passcode: &passcode, RequirePasscode: &require})
	must(t, err)
	if !updated.HasPasscode || updated.ExpiresAt == nil || updated.RedirectURL == nil {
		t.Fatalf("settings not saved: %#v", updated)
	}
	var stored string
	must(t, db.QueryRow(ctx, `SELECT passcode FROM envelopes WHERE id=$1::uuid`, draft.ID).Scan(&stored))
	if stored == passcode || bcrypt.CompareHashAndPassword([]byte(stored), []byte(passcode)) != nil {
		t.Fatal("passcode must be stored as a bcrypt hash")
	}

	empty := ""
	cleared, err := service.Update(ctx, orgID, draft.ID, envelope.UpdateInput{ClearExpiresAt: true, RedirectURL: &empty})
	must(t, err)
	if cleared.ExpiresAt != nil || cleared.RedirectURL != nil {
		t.Fatalf("expected expiry and redirect cleared: %#v", cleared)
	}

	bad := "javascript:alert(1)"
	if _, err := service.Update(ctx, orgID, draft.ID, envelope.UpdateInput{RedirectURL: &bad}); err == nil {
		t.Fatal("unsafe redirect URL accepted")
	}
}
