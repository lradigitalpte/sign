// Package heartbeat records which processes are alive and when recurring jobs last ran, in the database,
// so the admin System page can see the worker as well as the API.
package heartbeat

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"runtime/debug"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Interval is how often each process reports in. The admin app treats a process as offline after three missed beats.
const Interval = 30 * time.Second

// Job names, shared with the admin System page.
const (
	JobEnvelopeScheduler = "envelope_scheduler"
	JobLifecycle         = "lifecycle"
	JobEmailDelivery     = "email_delivery"
)

var (
	startedAt  = time.Now().UTC()
	instanceID = func() string {
		host, _ := os.Hostname()
		return fmt.Sprintf("%s-%d-%d", host, os.Getpid(), startedAt.Unix())
	}()
)

// InstanceID identifies this process across restarts and hosts.
func InstanceID() string { return instanceID }

// StartedAt is when this process started.
func StartedAt() time.Time { return startedAt }

// Version is the VCS revision the binary was built from, or "dev".
func Version() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	revision, modified := "", false
	for _, setting := range info.Settings {
		switch setting.Key {
		case "vcs.revision":
			revision = setting.Value
		case "vcs.modified":
			modified = setting.Value == "true"
		}
	}
	if revision == "" {
		return "dev"
	}
	if len(revision) > 12 {
		revision = revision[:12]
	}
	if modified {
		revision += "-dirty"
	}
	return revision
}

// RunInstance reports this process as alive every Interval until ctx ends.
// service is "api" or "worker"; roles lists extra work it does, such as "email" or "scheduler".
func RunInstance(ctx context.Context, db *pgxpool.Pool, service string, roles []string, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	if roles == nil {
		roles = []string{}
	}
	host, _ := os.Hostname()
	version := Version()
	beat := func() {
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)
		_, err := db.Exec(ctx, `
INSERT INTO service_instances (id, service, roles, hostname, pid, version, started_at, last_seen_at, goroutines, memory_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9)
ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, last_seen_at = now(), goroutines = EXCLUDED.goroutines, memory_bytes = EXCLUDED.memory_bytes`,
			instanceID, service, roles, host, os.Getpid(), version, startedAt, runtime.NumGoroutine(), int64(mem.Sys))
		if err != nil && ctx.Err() == nil {
			logger.Warn("heartbeat: report instance", "error", err)
		}
		// Processes that stopped a week ago are no longer interesting.
		_, _ = db.Exec(ctx, `DELETE FROM service_instances WHERE last_seen_at < now() - interval '7 days'`)
	}
	ticker := time.NewTicker(Interval)
	defer ticker.Stop()
	for {
		beat()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RecordRun saves the outcome of one run of a recurring job. Failures to save are only logged:
// monitoring must never stop the job itself.
func RecordRun(ctx context.Context, db *pgxpool.Pool, name string, interval time.Duration, started time.Time, runErr error) {
	if db == nil {
		return
	}
	finished := time.Now().UTC()
	var errText *string
	if runErr != nil {
		text := runErr.Error()
		if len(text) > 2000 {
			text = text[:2000]
		}
		errText = &text
	}
	// The run already happened; record it even if shutdown has begun.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	_, err := db.Exec(ctx, `
INSERT INTO scheduled_job_runs (name, interval_seconds, last_started_at, last_finished_at, last_duration_ms, last_success_at, last_error, last_error_at, last_instance, runs, failures)
VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::text IS NULL THEN $4 END, $6, CASE WHEN $6::text IS NOT NULL THEN $4 END, $7, 1, CASE WHEN $6::text IS NULL THEN 0 ELSE 1 END)
ON CONFLICT (name) DO UPDATE SET
  interval_seconds = EXCLUDED.interval_seconds,
  last_started_at = EXCLUDED.last_started_at,
  last_finished_at = EXCLUDED.last_finished_at,
  last_duration_ms = EXCLUDED.last_duration_ms,
  last_success_at = COALESCE(EXCLUDED.last_success_at, scheduled_job_runs.last_success_at),
  last_error = COALESCE(EXCLUDED.last_error, scheduled_job_runs.last_error),
  last_error_at = COALESCE(EXCLUDED.last_error_at, scheduled_job_runs.last_error_at),
  last_instance = EXCLUDED.last_instance,
  runs = scheduled_job_runs.runs + 1,
  failures = scheduled_job_runs.failures + EXCLUDED.failures`,
		name, int(interval/time.Second), started.UTC(), finished, finished.Sub(started).Milliseconds(), errText, instanceID)
	if err != nil {
		slog.Warn("heartbeat: record job run", "job", name, "error", err)
	}
}

// Throttled records a job that runs far more often than anyone needs to see, such as the email
// processor's 2-second loop: successes are saved at most once per every, failures always.
type Throttled struct {
	db    *pgxpool.Pool
	name  string
	every time.Duration
	mu    sync.Mutex
	last  time.Time
}

func NewThrottled(db *pgxpool.Pool, name string, every time.Duration) *Throttled {
	return &Throttled{db: db, name: name, every: every}
}

func (t *Throttled) Record(ctx context.Context, started time.Time, err error) {
	if t == nil {
		return
	}
	t.mu.Lock()
	if err == nil && time.Since(t.last) < t.every {
		t.mu.Unlock()
		return
	}
	t.last = time.Now()
	t.mu.Unlock()
	RecordRun(ctx, t.db, t.name, t.every, started, err)
}
