package admin

import (
	"testing"
	"time"
)

func TestJobStatus(t *testing.T) {
	now := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	at := func(ago time.Duration) *time.Time { v := now.Add(-ago); return &v }
	cases := []struct {
		name string
		job  ScheduledJob
		want string
	}{
		{"never ran", ScheduledJob{}, "never"},
		{"recent success", ScheduledJob{LastFinishedAt: at(30 * time.Second), LastSuccessAt: at(30 * time.Second)}, "ok"},
		{"failed after last success", ScheduledJob{LastFinishedAt: at(time.Minute), LastSuccessAt: at(2 * time.Minute), LastErrorAt: at(time.Minute)}, "failing"},
		{"never succeeded", ScheduledJob{LastFinishedAt: at(time.Minute), LastErrorAt: at(time.Minute)}, "failing"},
		{"recovered after a failure", ScheduledJob{LastFinishedAt: at(time.Minute), LastSuccessAt: at(time.Minute), LastErrorAt: at(10 * time.Minute)}, "ok"},
		{"missed two runs", ScheduledJob{LastFinishedAt: at(5 * time.Minute), LastSuccessAt: at(5 * time.Minute)}, "late"},
		{"within slack", ScheduledJob{LastFinishedAt: at(3 * time.Minute), LastSuccessAt: at(3 * time.Minute)}, "ok"},
	}
	for _, c := range cases {
		if got := jobStatus(c.job, time.Minute, now); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestWorse(t *testing.T) {
	if got := worse(healthOK, healthOff); got != healthOK {
		t.Errorf("off must not lower ok, got %q", got)
	}
	if got := worse(healthDegraded, healthOK); got != healthDegraded {
		t.Errorf("got %q, want degraded", got)
	}
	if got := worse(healthDegraded, healthDown); got != healthDown {
		t.Errorf("got %q, want down", got)
	}
}
