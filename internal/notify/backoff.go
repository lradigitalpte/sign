package notify

import (
	"errors"
	"time"

	"signing-platform/internal/email"
)

const MaxAttempts = 8

var ErrPermanent = errors.New("permanent delivery failure")

type Job struct {
	ID              string
	EnvelopeID      string
	RecipientID     string
	Kind            string
	TokenCiphertext []byte
	Attempts        int
}

type Invitation struct {
	EnvelopeID     string
	EnvelopeTitle  string
	EmailSubject   *string
	EmailBody      *string
	RecipientID    string
	RecipientName  string
	RecipientEmail string
	RecipientRole  string
	PrivateMessage *string
	ExpiresAt      time.Time
	Branding       email.Branding
}

func Backoff(attempt int) time.Duration {
	delays := []time.Duration{
		15 * time.Second,
		30 * time.Second,
		time.Minute,
		2 * time.Minute,
		5 * time.Minute,
		15 * time.Minute,
		30 * time.Minute,
		time.Hour,
	}
	if attempt < 1 {
		attempt = 1
	}
	if attempt > len(delays) {
		return delays[len(delays)-1]
	}
	return delays[attempt-1]
}

func Retryable(err error, attempts int) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrPermanent) {
		return false
	}
	return attempts < MaxAttempts
}

func jobKind(kind string) string {
	switch kind {
	case "reminder", "completion":
		return kind
	default:
		return "invitation"
	}
}

func deliveredEvent(kind string) string {
	return jobKind(kind) + ".delivered"
}

func failedEvent(kind string) string {
	return jobKind(kind) + ".failed"
}
