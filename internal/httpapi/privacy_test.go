package httpapi

import "testing"

func TestValidateRetention(t *testing.T) {
	cases := []struct {
		name   string
		config map[string]any
		ok     bool
	}{
		{"off", map[string]any{"autoDelete": false}, true},
		{"empty", map[string]any{}, true},
		{"legal hold only", map[string]any{"legalHold": true}, true},
		{"on with a valid period", map[string]any{"autoDelete": true, "retentionMonths": float64(24)}, true},
		{"on without a period", map[string]any{"autoDelete": true}, false},
		{"period too short", map[string]any{"autoDelete": true, "retentionMonths": float64(1)}, false},
		{"period too long", map[string]any{"autoDelete": true, "retentionMonths": float64(600)}, false},
		{"fractional period", map[string]any{"autoDelete": true, "retentionMonths": 6.5}, false},
		{"string flag", map[string]any{"autoDelete": "true", "retentionMonths": float64(24)}, false},
	}
	for _, tc := range cases {
		if got := validateRetention(tc.config); (got == "") != tc.ok {
			t.Errorf("%s: validateRetention = %q, want ok=%v", tc.name, got, tc.ok)
		}
	}
}
