package email

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestInvitationIncludesSecureLink(t *testing.T) {
	expires := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	message := Invitation("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/token-value", expires, InvitationOptions{}, Branding{})
	if !strings.Contains(message.Text, "http://localhost:3000/sign/token-value") || message.To != "alex@example.com" {
		t.Fatalf("unexpected message %#v", message)
	}
	if !strings.Contains(message.HTML, "Secure Sign") {
		t.Fatalf("expected default brand name in HTML, got %s", message.HTML)
	}
}

func TestReminderAndCompletionSubjects(t *testing.T) {
	expires := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	reminder := Reminder("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/token-value", expires, "signer", Branding{})
	if !strings.Contains(reminder.Subject, "Reminder") || !strings.Contains(reminder.Text, "http://localhost:3000/sign/token-value") {
		t.Fatalf("unexpected reminder %#v", reminder)
	}
	completion := Completion("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/token-value/completed", Branding{})
	if !strings.Contains(completion.Subject, "completed") || !strings.Contains(completion.Text, "/sign/token-value/completed") {
		t.Fatalf("unexpected completion %#v", completion)
	}
}

func TestBrandingCustomizesEmailHTML(t *testing.T) {
	expires := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	branded := Branding{LogoDataURL: "data:image/png;base64,AAAA", BrandName: "Acme Legal", HidePlatformBranding: true}
	message := Invitation("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/token-value", expires, InvitationOptions{}, branded)
	if !strings.Contains(message.HTML, `src="data:image/png;base64,AAAA"`) {
		t.Fatalf("expected logo image in HTML, got %s", message.HTML)
	}
	if strings.Contains(message.HTML, "Powered by Secure Sign") {
		t.Fatalf("expected platform branding to be hidden, got %s", message.HTML)
	}

	unbranded := Invitation("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/token-value", expires, InvitationOptions{}, Branding{})
	if !strings.Contains(unbranded.HTML, "Powered by Secure Sign") {
		t.Fatalf("expected default platform branding footer, got %s", unbranded.HTML)
	}
}

func TestPreviewStoresAndListsMessages(t *testing.T) {
	dir := t.TempDir()
	preview, err := NewPreview(dir, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := preview.Send(context.Background(), Invitation("alex@example.com", "Alex", "NDA", "http://localhost:3000/sign/abc", time.Now(), InvitationOptions{}, Branding{}))
	if err != nil || result.Provider != "preview" {
		t.Fatalf("send %v %#v", err, result)
	}
	matches, err := filepath.Glob(filepath.Join(dir, "*.html"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("preview files %v %v", matches, err)
	}
	body, err := os.ReadFile(matches[0])
	if err != nil || !strings.Contains(string(body), "alex@example.com") {
		t.Fatalf("preview body %s %v", body, err)
	}

	recorder := httptest.NewRecorder()
	preview.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), filepath.Base(matches[0])) {
		t.Fatalf("index %d %s", recorder.Code, recorder.Body.String())
	}
}

type stubMailer struct{ sent bool }

func (s *stubMailer) Send(context.Context, Message) (Result, error) {
	s.sent = true
	return Result{Provider: "smtp", MessageID: "relayed"}, nil
}

func TestPreviewRelaysWhenConfigured(t *testing.T) {
	relay := &stubMailer{}
	preview, err := NewPreview(t.TempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)), relay)
	if err != nil {
		t.Fatal(err)
	}
	result, err := preview.Send(context.Background(), Message{To: "a@example.com", Subject: "Hi", Text: "Hello"})
	if err != nil || !relay.sent || result.Provider != "smtp" {
		t.Fatalf("relay %v %#v sent=%v", err, result, relay.sent)
	}
}
