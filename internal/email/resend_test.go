package email

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResendSendPostsMessage(t *testing.T) {
	var gotAuth string
	var gotBody resendRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_123"}`))
	}))
	defer server.Close()

	mailer := NewResend("re_test_key", "Signing Platform <noreply@example.com>")
	mailer.baseURL = server.URL

	result, err := mailer.Send(context.Background(), Message{To: "alex@example.com", Subject: "Hi", Text: "Hello"})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if result.Provider != "resend" || result.MessageID != "msg_123" {
		t.Fatalf("unexpected result %#v", result)
	}
	if gotAuth != "Bearer re_test_key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotBody.To[0] != "alex@example.com" || gotBody.Subject != "Hi" {
		t.Fatalf("unexpected request body %#v", gotBody)
	}
}

func TestResendSendReturnsAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"invalid API key","name":"validation_error"}`))
	}))
	defer server.Close()

	mailer := NewResend("bad_key", "")
	mailer.baseURL = server.URL

	_, err := mailer.Send(context.Background(), Message{To: "alex@example.com", Subject: "Hi", Text: "Hello"})
	if err == nil || !strings.Contains(err.Error(), "invalid API key") {
		t.Fatalf("Send() error = %v, want invalid API key", err)
	}
}

func TestResendSendRequiresAPIKey(t *testing.T) {
	mailer := NewResend("", "")
	if _, err := mailer.Send(context.Background(), Message{To: "alex@example.com"}); err == nil {
		t.Fatal("Send() error = nil, want missing API key error")
	}
}
