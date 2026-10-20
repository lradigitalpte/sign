package signing

import (
	"context"
	"errors"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"signing-platform/internal/storage"
)

type passcodeStore struct {
	fakeStore
	failures    int
	verified    bool
	lockedUntil *time.Time
}

func (p *passcodeStore) RecordPasscodeFailure(context.Context, string, AuditContext) (*time.Time, error) {
	p.failures++
	return p.lockedUntil, nil
}

func (p *passcodeStore) MarkPasscodeVerified(context.Context, []byte, string, AuditContext) error {
	p.verified = true
	p.session.passcodeUnlocked = true
	return nil
}

func protectedSession(t *testing.T) Session {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("4821"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return Session{
		Envelope:     Envelope{ID: "env", Title: "NDA", Status: "in_progress"},
		Recipient:    Recipient{ID: "r1", Name: "Alex", Email: "alex@example.com", Role: "signer", Status: "sent"},
		Documents:    []Document{{ID: "doc"}},
		Fields:       []Field{{ID: "f1", RecipientID: "r1", Required: true}},
		passcodeHash: string(hash),
	}
}

func TestLockedSessionHidesDocumentDetails(t *testing.T) {
	store := &passcodeStore{fakeStore: fakeStore{session: protectedSession(t)}}
	session, err := NewService(store, storage.Static(noopObjects{})).Session(context.Background(), []byte("hash"))
	if err != nil {
		t.Fatal(err)
	}
	if !session.Locked || !session.PasscodeRequired {
		t.Fatalf("expected locked session, got %#v", session)
	}
	if len(session.Documents) != 0 || len(session.Fields) != 0 || session.Recipient.Email != "" {
		t.Fatalf("locked session leaked details: %#v", session)
	}
}

func TestLockedSessionBlocksActions(t *testing.T) {
	store := &passcodeStore{fakeStore: fakeStore{session: protectedSession(t)}}
	service := NewService(store, storage.Static(noopObjects{}))
	if _, err := service.View(context.Background(), []byte("hash"), AuditContext{}); !errors.Is(err, ErrPasscodeRequired) {
		t.Fatalf("view error=%v", err)
	}
	if _, _, _, _, err := service.DownloadAttachment(context.Background(), []byte("hash"), "a1"); !errors.Is(err, ErrPasscodeRequired) {
		t.Fatalf("download error=%v", err)
	}
}

func TestVerifyPasscode(t *testing.T) {
	store := &passcodeStore{fakeStore: fakeStore{session: protectedSession(t)}}
	service := NewService(store, storage.Static(noopObjects{}))

	if _, err := service.VerifyPasscode(context.Background(), []byte("hash"), "0000", AuditContext{}); !errors.Is(err, ErrPasscodeIncorrect) {
		t.Fatalf("wrong passcode error=%v", err)
	}
	if store.failures != 1 || store.verified {
		t.Fatalf("failures=%d verified=%v", store.failures, store.verified)
	}

	session, err := service.VerifyPasscode(context.Background(), []byte("hash"), " 4821 ", AuditContext{})
	if err != nil {
		t.Fatal(err)
	}
	if !store.verified || session.Locked || len(session.Documents) != 1 {
		t.Fatalf("expected unlocked session, got %#v", session)
	}
}

func TestVerifyPasscodeWhileLockedOut(t *testing.T) {
	session := protectedSession(t)
	until := time.Now().Add(10 * time.Minute)
	session.passcodeLockedUntil = &until
	store := &passcodeStore{fakeStore: fakeStore{session: session}}
	if _, err := NewService(store, storage.Static(noopObjects{})).VerifyPasscode(context.Background(), []byte("hash"), "4821", AuditContext{}); !errors.Is(err, ErrPasscodeLocked) {
		t.Fatalf("error=%v", err)
	}
	if store.verified {
		t.Fatal("correct passcode must not unlock during a lockout")
	}
}

func TestExpiredEnvelopeCannotBeSigned(t *testing.T) {
	store := &fakeStore{session: Session{
		Envelope:  Envelope{Status: "expired"},
		Recipient: Recipient{ID: "r1", Role: "signer", Status: "sent"},
	}}
	_, err := NewService(store, storage.Static(noopObjects{})).Complete(context.Background(), []byte("hash"), AuditContext{})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error=%v", err)
	}
}
