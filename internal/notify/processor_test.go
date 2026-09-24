package notify

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"signing-platform/internal/email"
	"signing-platform/internal/securetoken"
)

type memoryStore struct {
	job        Job
	claimed    bool
	invitation Invitation
	sent       bool
	failed     error
	retryAt    time.Time
}

func (m *memoryStore) Claim(context.Context) (Job, bool, error) {
	if m.claimed || m.job.ID == "" {
		return Job{}, false, nil
	}
	m.claimed = true
	m.job.Attempts++
	return m.job, true, nil
}

func (m *memoryStore) LoadInvitation(context.Context, Job) (Invitation, error) {
	if m.invitation.RecipientEmail == "" {
		return Invitation{}, ErrPermanent
	}
	return m.invitation, nil
}

func (m *memoryStore) MarkSent(context.Context, Job, string, string) error {
	m.sent = true
	return nil
}

func (m *memoryStore) MarkFailed(_ context.Context, _ Job, err error, retryAt time.Time) error {
	m.failed = err
	m.retryAt = retryAt
	return nil
}

type capturingMailer struct{ last email.Message }

func (c *capturingMailer) Send(_ context.Context, message email.Message) (email.Result, error) {
	c.last = message
	return email.Result{Provider: "preview", MessageID: "msg-1"}, nil
}

type failingMailer struct{ err error }

func (f *failingMailer) Send(context.Context, email.Message) (email.Result, error) {
	return email.Result{}, f.err
}

func testProtector(t *testing.T) (*securetoken.Protector, []byte) {
	t.Helper()
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32))
	protector, err := securetoken.NewProtector(key)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := protector.Encrypt([]byte("raw-token"))
	if err != nil {
		t.Fatal(err)
	}
	return protector, ciphertext
}

func TestProcessOneDeliversInvitation(t *testing.T) {
	protector, ciphertext := testProtector(t)
	store := &memoryStore{
		job:        Job{ID: "job", EnvelopeID: "env", RecipientID: "recipient", TokenCiphertext: ciphertext},
		invitation: Invitation{EnvelopeTitle: "NDA", RecipientName: "Alex", RecipientEmail: "alex@example.com", ExpiresAt: time.Now().Add(24 * time.Hour)},
	}
	mailer := &capturingMailer{}
	ok, err := NewProcessor(store, mailer, protector, "http://localhost:3000", slog.New(slog.NewTextHandler(io.Discard, nil))).ProcessOne(context.Background())
	if err != nil || !ok || !store.sent {
		t.Fatalf("process %v ok=%v sent=%v", err, ok, store.sent)
	}
	if !strings.Contains(mailer.last.Text, "http://localhost:3000/sign/raw-token") {
		t.Fatalf("missing signing link in %q", mailer.last.Text)
	}
}

func TestProcessOneRetriesTemporaryFailure(t *testing.T) {
	protector, ciphertext := testProtector(t)
	store := &memoryStore{
		job:        Job{ID: "job", EnvelopeID: "env", RecipientID: "recipient", TokenCiphertext: ciphertext},
		invitation: Invitation{RecipientEmail: "alex@example.com", RecipientName: "Alex", EnvelopeTitle: "NDA", ExpiresAt: time.Now()},
	}
	ok, err := NewProcessor(store, &failingMailer{err: errors.New("smtp timeout")}, protector, "http://localhost:3000", slog.New(slog.NewTextHandler(io.Discard, nil))).ProcessOne(context.Background())
	if err != nil || !ok || store.sent || store.failed == nil || store.retryAt.Before(time.Now()) {
		t.Fatalf("retry %v ok=%v sent=%v failed=%v retry=%s", err, ok, store.sent, store.failed, store.retryAt)
	}
}

func TestProcessOneStopsAfterPermanentFailure(t *testing.T) {
	protector, _ := testProtector(t)
	store := &memoryStore{
		job: Job{ID: "job", EnvelopeID: "env", RecipientID: "recipient", TokenCiphertext: []byte("bad")},
	}
	ok, err := NewProcessor(store, &capturingMailer{}, protector, "http://localhost:3000", slog.New(slog.NewTextHandler(io.Discard, nil))).ProcessOne(context.Background())
	if err != nil || !ok || store.failed == nil || Retryable(store.failed, store.job.Attempts) {
		t.Fatalf("permanent %v ok=%v failed=%v attempts=%d", err, ok, store.failed, store.job.Attempts)
	}
}

func TestProcessOneDeliversCompletionWithSecureLink(t *testing.T) {
	protector, _ := testProtector(t)
	ciphertext, err := protector.Encrypt([]byte("completion-token"))
	if err != nil {
		t.Fatal(err)
	}
	store := &memoryStore{
		job:        Job{ID: "job", EnvelopeID: "env", RecipientID: "recipient", Kind: "completion", TokenCiphertext: ciphertext},
		invitation: Invitation{EnvelopeTitle: "NDA", RecipientName: "Alex", RecipientEmail: "alex@example.com"},
	}
	mailer := &capturingMailer{}
	ok, err := NewProcessor(store, mailer, protector, "http://localhost:3000", slog.New(slog.NewTextHandler(io.Discard, nil))).ProcessOne(context.Background())
	if err != nil || !ok || !store.sent {
		t.Fatalf("process %v ok=%v sent=%v", err, ok, store.sent)
	}
	if !strings.Contains(mailer.last.Subject, "completed") || !strings.Contains(mailer.last.Text, "/sign/completion-token/completed") {
		t.Fatalf("unexpected completion mail %#v", mailer.last)
	}
}

func TestBackoffGrows(t *testing.T) {
	if Backoff(1) != 15*time.Second || Backoff(8) != time.Hour || Backoff(99) != time.Hour {
		t.Fatalf("unexpected backoff %s %s %s", Backoff(1), Backoff(8), Backoff(99))
	}
}
