package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"testing"
	"time"
)

// Sign builds a WorkOS-Signature header the way WorkOS does (millisecond timestamp).
func Sign(secret string, body []byte, at time.Time) string {
	timestamp := strconv.FormatInt(at.UnixMilli(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return "t=" + timestamp + ", v1=" + hex.EncodeToString(mac.Sum(nil))
}

func TestVerifySignature(t *testing.T) {
	now := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"id":"event_1","event":"user.updated","data":{}}`)
	secretsAndHeaders := []struct {
		name   string
		header string
		ok     bool
	}{
		{"valid", Sign("secret", body, now), true},
		{"valid within tolerance", Sign("secret", body, now.Add(-4*time.Minute)), true},
		{"seconds timestamp", func() string {
			ts := strconv.FormatInt(now.Unix(), 10)
			mac := hmac.New(sha256.New, []byte("secret"))
			mac.Write([]byte(ts + "."))
			mac.Write(body)
			return "t=" + ts + ",v1=" + hex.EncodeToString(mac.Sum(nil))
		}(), true},
		{"wrong secret", Sign("other", body, now), false},
		{"too old", Sign("secret", body, now.Add(-10*time.Minute)), false},
		{"from the future", Sign("secret", body, now.Add(10*time.Minute)), false},
		{"missing signature", "t=" + strconv.FormatInt(now.UnixMilli(), 10), false},
		{"garbage", "nonsense", false},
		{"empty", "", false},
	}
	for _, tc := range secretsAndHeaders {
		t.Run(tc.name, func(t *testing.T) {
			err := VerifySignature(tc.header, body, "secret", now)
			if tc.ok && err != nil {
				t.Fatalf("want valid, got %v", err)
			}
			if !tc.ok && !errors.Is(err, ErrSignature) {
				t.Fatalf("want ErrSignature, got %v", err)
			}
		})
	}
	if err := VerifySignature(Sign("secret", body, now), []byte(`{"tampered":true}`), "secret", now); !errors.Is(err, ErrSignature) {
		t.Fatalf("tampered body accepted: %v", err)
	}
	if err := VerifySignature(Sign("", body, now), body, "", now); !errors.Is(err, ErrSignature) {
		t.Fatalf("empty secret accepted: %v", err)
	}
}
