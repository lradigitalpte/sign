package send

import (
	"strings"
	"testing"
	"time"
)

func hasError(review Review, fragment string) bool {
	for _, message := range review.Errors {
		if strings.Contains(message, fragment) {
			return true
		}
	}
	return false
}

func TestEvaluateRequiresPasscodeWhenEnabled(t *testing.T) {
	value := readySnapshot()
	value.RequirePasscode = true
	if review := evaluate(value); review.Ready || !hasError(review, "passcode") {
		t.Fatalf("expected passcode error, got %#v", review.Errors)
	}
	value.HasPasscode = true
	if review := evaluate(value); !review.Ready {
		t.Fatalf("unexpected errors %#v", review.Errors)
	}
}

func TestEvaluateRejectsPastExpiration(t *testing.T) {
	value := readySnapshot()
	value.Now = time.Now()
	past := value.Now.Add(-time.Hour)
	value.ExpiresAt = &past
	if review := evaluate(value); review.Ready || !hasError(review, "expiration") {
		t.Fatalf("expected expiration error, got %#v", review.Errors)
	}
	future := value.Now.Add(24 * time.Hour)
	value.ExpiresAt = &future
	if review := evaluate(value); !review.Ready {
		t.Fatalf("unexpected errors %#v", review.Errors)
	}
}
