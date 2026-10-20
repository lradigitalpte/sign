package stripe

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"testing"
	"time"
)

func sign(payload, secret string, at time.Time) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.%s", at.Unix(), payload)
	return fmt.Sprintf("t=%d,v1=%s", at.Unix(), hex.EncodeToString(mac.Sum(nil)))
}

func TestVerifyWebhook(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	payload := `{"id":"evt_1","type":"invoice.paid","data":{"object":{"id":"in_1"}}}`

	event, err := VerifyWebhook([]byte(payload), sign(payload, "whsec_test", now), "whsec_test", now)
	if err != nil || event.ID != "evt_1" || event.Type != "invoice.paid" {
		t.Fatalf("valid signature: event %+v, err %v", event, err)
	}

	// A second, rotated-out signature alongside the valid one is fine.
	header := sign(payload, "whsec_test", now) + ",v1=deadbeef"
	if _, err := VerifyWebhook([]byte(payload), header, "whsec_test", now); err != nil {
		t.Fatalf("extra signature: %v", err)
	}

	cases := map[string]struct {
		payload, header string
	}{
		"wrong secret":     {payload, sign(payload, "whsec_other", now)},
		"tampered payload": {payload + " ", sign(payload, "whsec_test", now)},
		"too old":          {payload, sign(payload, "whsec_test", now.Add(-10*time.Minute))},
		"no signature":     {payload, fmt.Sprintf("t=%d", now.Unix())},
		"garbage":          {payload, "nonsense"},
	}
	for name, c := range cases {
		if _, err := VerifyWebhook([]byte(c.payload), c.header, "whsec_test", now); !errors.Is(err, ErrBadSignature) {
			t.Errorf("%s: got %v, want ErrBadSignature", name, err)
		}
	}
}

func TestPeriodEnd(t *testing.T) {
	sub := Subscription{Status: "active"}
	sub.Items.Data = []SubscriptionItem{{CurrentPeriodEnd: 1_800_000_000}}
	if end := sub.PeriodEnd(); end == nil || end.Unix() != 1_800_000_000 {
		t.Fatalf("item period end: %v", end)
	}
	sub.CurrentPeriodEnd = 1_700_000_000
	if end := sub.PeriodEnd(); end.Unix() != 1_700_000_000 {
		t.Fatalf("subscription period end should win: %v", end)
	}
	sub.Status, sub.TrialEnd = "trialing", 1_750_000_000
	if end := sub.PeriodEnd(); end.Unix() != 1_750_000_000 {
		t.Fatalf("trial end: %v", end)
	}
}
