package notify

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
)

func TestProcessOneDeliversSenderNotice(t *testing.T) {
	protector, _ := testProtector(t)
	store := &memoryStore{
		job: Job{ID: "job", EnvelopeID: "env-1", RecipientID: "recipient", Kind: "sender_signed"},
		invitation: Invitation{
			EnvelopeID: "env-1", EnvelopeTitle: "NDA", RecipientName: "Alex", RecipientEmail: "alex@example.com", RecipientRole: "approver",
			SenderName: "Sam", SenderEmail: "sam@example.com",
		},
	}
	mailer := &capturingMailer{}
	ok, err := NewProcessor(store, mailer, protector, "http://localhost:3000", slog.New(slog.NewTextHandler(io.Discard, nil))).ProcessOne(context.Background())
	if err != nil || !ok || !store.sent {
		t.Fatalf("process %v ok=%v sent=%v", err, ok, store.sent)
	}
	if mailer.last.To != "sam@example.com" {
		t.Fatalf("sent to %q, want the sender", mailer.last.To)
	}
	if mailer.last.Subject != "Alex approved NDA" {
		t.Fatalf("subject %q", mailer.last.Subject)
	}
	if !strings.Contains(mailer.last.Text, "http://localhost:3000/envelopes/env-1") {
		t.Fatalf("missing envelope link in %q", mailer.last.Text)
	}
}
