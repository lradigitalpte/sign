package admin

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"runtime"
	"sync"
	"time"

	"signing-platform/internal/heartbeat"
	"signing-platform/internal/notify"
)

// ---- System health ----

// SystemOptions tells the System page what this deployment depends on. Secrets are never included.
type SystemOptions struct {
	Environment    string
	EmbeddedWorker bool
	// Storage checks Signet's own bucket; nil when it can't be checked.
	Storage       interface{ Check(context.Context) error }
	StorageBucket string
	EmailProvider string // "resend", "smtp" or ""
	SMTPAddress   string // host:port, when EmailProvider is "smtp"
	WorkOSJWKSURL string
}

// WithSystem enables the System page.
func (s *Service) WithSystem(options SystemOptions) *Service {
	s.system = options
	return s
}

// Health statuses, worst last.
const (
	healthOK       = "ok"
	healthOff      = "off" // not configured, and not needed here
	healthDegraded = "degraded"
	healthDown     = "down"
)

var healthRank = map[string]int{healthOK: 0, healthOff: 0, healthDegraded: 1, healthDown: 2}

func worse(a, b string) string {
	if healthRank[b] > healthRank[a] {
		return b
	}
	return a
}

type HealthCheck struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	LatencyMs *int64 `json:"latencyMs"`
	Detail    string `json:"detail"`
	Error     string `json:"error,omitempty"`
}

type PoolStats struct {
	Max      int32 `json:"max"`
	Total    int32 `json:"total"`
	Idle     int32 `json:"idle"`
	InUse    int32 `json:"inUse"`
	Acquires int64 `json:"acquires"`
	// Times a request had to wait because every connection was busy.
	Waits int64 `json:"waits"`
}

// RuntimeInfo describes the API process that answered the request.
type RuntimeInfo struct {
	InstanceID     string    `json:"instanceId"`
	Version        string    `json:"version"`
	GoVersion      string    `json:"goVersion"`
	StartedAt      time.Time `json:"startedAt"`
	NumCPU         int       `json:"numCpu"`
	Goroutines     int       `json:"goroutines"`
	HeapBytes      uint64    `json:"heapBytes"`
	SysBytes       uint64    `json:"sysBytes"`
	GCCount        uint32    `json:"gcCount"`
	EmbeddedWorker bool      `json:"embeddedWorker"`
	Pool           PoolStats `json:"pool"`
}

type ServiceInstance struct {
	ID          string    `json:"id"`
	Service     string    `json:"service"`
	Roles       []string  `json:"roles"`
	Hostname    string    `json:"hostname"`
	PID         int       `json:"pid"`
	Version     string    `json:"version"`
	StartedAt   time.Time `json:"startedAt"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
	Online      bool      `json:"online"`
	Current     bool      `json:"current"` // the process answering this request
	Goroutines  int       `json:"goroutines"`
	MemoryBytes int64     `json:"memoryBytes"`
}

type ScheduledJob struct {
	Name            string     `json:"name"`
	Label           string     `json:"label"`
	Description     string     `json:"description"`
	RunsOn          string     `json:"runsOn"`
	IntervalSeconds int        `json:"intervalSeconds"`
	Status          string     `json:"status"` // ok, late, failing or never
	LastStartedAt   *time.Time `json:"lastStartedAt"`
	LastFinishedAt  *time.Time `json:"lastFinishedAt"`
	LastDurationMs  *int       `json:"lastDurationMs"`
	LastSuccessAt   *time.Time `json:"lastSuccessAt"`
	LastError       *string    `json:"lastError"`
	LastErrorAt     *time.Time `json:"lastErrorAt"`
	LastInstance    *string    `json:"lastInstance"`
	Runs            int64      `json:"runs"`
	Failures        int64      `json:"failures"`
}

type TableSize struct {
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
	Rows  int64  `json:"rows"`
}

type FileCategory struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Count int64  `json:"count"`
	Bytes int64  `json:"bytes"`
	// Signed copies don't record their size; their bytes are the originals' size.
	Estimated bool `json:"estimated"`
}

type WorkspaceStorage struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Bytes        int64  `json:"bytes"`
	Files        int64  `json:"files"`
	CustomBucket bool   `json:"customBucket"`
}

type StorageUsage struct {
	DatabaseBytes          int64              `json:"databaseBytes"`
	Tables                 []TableSize        `json:"tables"`
	Files                  []FileCategory     `json:"files"`
	CustomBucketWorkspaces int64              `json:"customBucketWorkspaces"`
	CustomBucketBytes      int64              `json:"customBucketBytes"`
	TopWorkspaces          []WorkspaceStorage `json:"topWorkspaces"`
}

type EmailQueueHealth struct {
	JobCounts
	OldestQueuedAt *time.Time `json:"oldestQueuedAt"`
}

type SystemHealth struct {
	Status      string            `json:"status"`
	CheckedAt   time.Time         `json:"checkedAt"`
	Environment string            `json:"environment"`
	Checks      []HealthCheck     `json:"checks"`
	Runtime     RuntimeInfo       `json:"runtime"`
	Instances   []ServiceInstance `json:"instances"`
	Jobs        []ScheduledJob    `json:"jobs"`
	Storage     StorageUsage      `json:"storage"`
	EmailQueue  EmailQueueHealth  `json:"emailQueue"`
}

// A process counts as offline after missing three heartbeats.
const offlineAfter = 3 * heartbeat.Interval

const checkTimeout = 3 * time.Second

func (s *Service) SystemHealth(ctx context.Context) (SystemHealth, error) {
	result := SystemHealth{CheckedAt: time.Now().UTC(), Environment: s.system.Environment, Runtime: s.runtimeInfo()}

	// Dependency checks reach out over the network, so they run side by side.
	probes := []func(context.Context) HealthCheck{s.checkDatabase, s.checkStorage, s.checkEmailRelay, s.checkWorkOS}
	checks := make([]HealthCheck, len(probes))
	var wg sync.WaitGroup
	for i, probe := range probes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			probeCtx, cancel := context.WithTimeout(ctx, checkTimeout)
			defer cancel()
			checks[i] = probe(probeCtx)
		}()
	}
	wg.Wait()

	// Without the database nothing else can be read.
	if checks[0].Status == healthDown {
		result.Status = healthDown
		result.Checks = checks
		result.Instances, result.Jobs = []ServiceInstance{}, []ScheduledJob{}
		result.Storage = StorageUsage{Tables: []TableSize{}, Files: []FileCategory{}, TopWorkspaces: []WorkspaceStorage{}}
		return result, nil
	}

	var err error
	if result.Instances, err = s.serviceInstances(ctx); err != nil {
		return result, err
	}
	if result.Jobs, err = s.scheduledJobs(ctx); err != nil {
		return result, err
	}
	if result.Storage, err = s.storageUsage(ctx); err != nil {
		return result, err
	}
	if result.EmailQueue.JobCounts, err = s.jobCounts(ctx); err != nil {
		return result, err
	}
	if err := s.db.QueryRow(ctx, `SELECT min(j.created_at) FROM notification_jobs j WHERE j.status <> 'sent' AND j.available_at <= now() AND (`+jobStateSQL+`) = 'queued'`, notify.MaxAttempts).
		Scan(&result.EmailQueue.OldestQueuedAt); err != nil {
		return result, err
	}

	result.Checks = append(checks, s.checkEmailDelivery(result.Instances, result.EmailQueue))

	result.Status = healthOK
	for _, check := range result.Checks {
		result.Status = worse(result.Status, check.Status)
	}
	for _, job := range result.Jobs {
		if job.Status == "failing" || job.Status == "late" {
			result.Status = worse(result.Status, healthDegraded)
		}
	}
	return result, nil
}

func since(start time.Time) *int64 {
	ms := time.Since(start).Milliseconds()
	return &ms
}

func (s *Service) checkDatabase(ctx context.Context) HealthCheck {
	check := HealthCheck{Key: "database", Name: "Database", Status: healthOK}
	start := time.Now()
	if err := s.db.Ping(ctx); err != nil {
		check.Status, check.Detail, check.Error = healthDown, "PostgreSQL isn't answering", err.Error()
		return check
	}
	check.LatencyMs = since(start)
	var version string
	if err := s.db.QueryRow(ctx, `SHOW server_version`).Scan(&version); err == nil {
		check.Detail = "PostgreSQL " + version
	}
	stat := s.db.Stat()
	check.Detail += fmt.Sprintf(" · %d of %d connections in use", stat.AcquiredConns(), stat.MaxConns())
	if *check.LatencyMs > 500 {
		check.Status = healthDegraded
		check.Error = "slow to answer"
	} else if stat.MaxConns() > 0 && stat.AcquiredConns() >= stat.MaxConns() {
		check.Status = healthDegraded
		check.Error = "every connection in the pool is busy"
	}
	return check
}

func (s *Service) checkStorage(ctx context.Context) HealthCheck {
	check := HealthCheck{Key: "storage", Name: "Document storage", Status: healthOK, Detail: "Bucket " + s.system.StorageBucket}
	if s.system.Storage == nil {
		check.Status, check.Detail = healthOff, "Can't be checked from this process"
		return check
	}
	start := time.Now()
	if err := s.system.Storage.Check(ctx); err != nil {
		check.Status, check.Error = healthDown, err.Error()
		return check
	}
	check.LatencyMs = since(start)
	if *check.LatencyMs > 1000 {
		check.Status, check.Error = healthDegraded, "slow to answer"
	}
	return check
}

// dial measures how long a TCP connection takes to open.
func dial(ctx context.Context, address string) (*int64, error) {
	start := time.Now()
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	_ = conn.Close()
	return since(start), nil
}

func (s *Service) checkEmailRelay(ctx context.Context) HealthCheck {
	check := HealthCheck{Key: "email_relay", Name: "Email provider", Status: healthOK}
	var address string
	switch s.system.EmailProvider {
	case "resend":
		check.Detail, address = "Resend API", "api.resend.com:443"
	case "smtp":
		check.Detail, address = "SMTP server "+s.system.SMTPAddress, s.system.SMTPAddress
	default:
		if s.system.Environment == "development" {
			check.Status, check.Detail = healthOff, "None set: emails are only written to the local preview folder"
		} else {
			check.Status, check.Detail = healthDown, "Neither RESEND_API_KEY nor SMTP_HOST is set"
		}
		return check
	}
	latency, err := dial(ctx, address)
	if err != nil {
		check.Status, check.Error = healthDown, err.Error()
		return check
	}
	check.LatencyMs = latency
	return check
}

func (s *Service) checkWorkOS(ctx context.Context) HealthCheck {
	check := HealthCheck{Key: "workos", Name: "Sign-in (WorkOS)", Status: healthOK, Detail: "Signing keys (JWKS)"}
	if s.system.WorkOSJWKSURL == "" {
		check.Status, check.Detail = healthOff, "WORKOS_JWKS_URL isn't set"
		return check
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.system.WorkOSJWKSURL, nil)
	if err != nil {
		check.Status, check.Error = healthDown, err.Error()
		return check
	}
	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		check.Status, check.Error = healthDown, err.Error()
		return check
	}
	_ = resp.Body.Close()
	check.LatencyMs = since(start)
	if resp.StatusCode != http.StatusOK {
		check.Status, check.Error = healthDown, "WorkOS answered "+resp.Status
	} else if *check.LatencyMs > 1500 {
		check.Status, check.Error = healthDegraded, "slow to answer"
	}
	return check
}

// checkEmailDelivery is about Signet's side: is some process draining the queue, and is anything stuck?
func (s *Service) checkEmailDelivery(instances []ServiceInstance, queue EmailQueueHealth) HealthCheck {
	check := HealthCheck{Key: "email_delivery", Name: "Email delivery", Status: healthOK}
	senders := 0
	for _, instance := range instances {
		if !instance.Online {
			continue
		}
		for _, role := range instance.Roles {
			if role == "email" {
				senders++
			}
		}
	}
	switch {
	case senders == 0:
		check.Status = healthDown
		check.Detail = "No running process is sending email"
		check.Error = "start the worker (cmd/worker) or set EMBEDDED_WORKER on the API"
		return check
	case senders == 1:
		check.Detail = "1 process is sending email"
	default:
		check.Detail = fmt.Sprintf("%d processes are sending email", senders)
	}
	if stuck := queue.Stuck + queue.GaveUp; stuck > 0 {
		check.Status = healthDegraded
		check.Error = fmt.Sprintf("%d %s stuck or gave up", stuck, plural(stuck, "email", "emails"))
	} else if queue.OldestQueuedAt != nil && time.Since(*queue.OldestQueuedAt) > 10*time.Minute {
		check.Status = healthDegraded
		check.Error = "the oldest queued email has waited over 10 minutes"
	}
	return check
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func (s *Service) runtimeInfo() RuntimeInfo {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	info := RuntimeInfo{
		InstanceID:     heartbeat.InstanceID(),
		Version:        heartbeat.Version(),
		GoVersion:      runtime.Version(),
		StartedAt:      heartbeat.StartedAt(),
		NumCPU:         runtime.NumCPU(),
		Goroutines:     runtime.NumGoroutine(),
		HeapBytes:      mem.HeapAlloc,
		SysBytes:       mem.Sys,
		GCCount:        mem.NumGC,
		EmbeddedWorker: s.system.EmbeddedWorker,
	}
	if s.db != nil {
		stat := s.db.Stat()
		info.Pool = PoolStats{Max: stat.MaxConns(), Total: stat.TotalConns(), Idle: stat.IdleConns(), InUse: stat.AcquiredConns(), Acquires: stat.AcquireCount(), Waits: stat.EmptyAcquireCount()}
	}
	return info
}

func (s *Service) serviceInstances(ctx context.Context) ([]ServiceInstance, error) {
	rows, err := s.db.Query(ctx, `
SELECT id, service, roles, hostname, pid, version, started_at, last_seen_at, last_seen_at > now() - make_interval(secs => $1), goroutines, memory_bytes
FROM service_instances
WHERE last_seen_at > now() - interval '24 hours'
ORDER BY 9 DESC, service, started_at DESC
LIMIT 50`, offlineAfter.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	instances := []ServiceInstance{}
	for rows.Next() {
		var i ServiceInstance
		if err := rows.Scan(&i.ID, &i.Service, &i.Roles, &i.Hostname, &i.PID, &i.Version, &i.StartedAt, &i.LastSeenAt, &i.Online, &i.Goroutines, &i.MemoryBytes); err != nil {
			return nil, err
		}
		i.Current = i.ID == heartbeat.InstanceID()
		instances = append(instances, i)
	}
	return instances, rows.Err()
}

type jobCatalogEntry struct {
	name, label, description string
	interval                 time.Duration
	worker                   bool // runs in cmd/worker (and in the API with EMBEDDED_WORKER), otherwise in the API
}

// The recurring jobs Signet runs, in the order the System page lists them.
var jobCatalog = []jobCatalogEntry{
	{heartbeat.JobEmailDelivery, "Email delivery", "Sends queued invitations, reminders and notices. Checks the queue every 2 seconds; a run is recorded every 30 seconds, and every failure.", heartbeat.Interval, true},
	{heartbeat.JobEnvelopeScheduler, "Reminders and expiry", "Expires overdue envelopes and queues automatic reminders.", time.Minute, true},
	{heartbeat.JobLifecycle, "Deletions and retention", "Carries out scheduled workspace deletions and removes envelopes past their workspace's retention period.", time.Hour, false},
}

func (s *Service) scheduledJobs(ctx context.Context) ([]ScheduledJob, error) {
	rows, err := s.db.Query(ctx, `
SELECT name, last_started_at, last_finished_at, last_duration_ms, last_success_at, last_error, last_error_at, last_instance, runs, failures
FROM scheduled_job_runs`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	recorded := map[string]ScheduledJob{}
	for rows.Next() {
		var j ScheduledJob
		if err := rows.Scan(&j.Name, &j.LastStartedAt, &j.LastFinishedAt, &j.LastDurationMs, &j.LastSuccessAt, &j.LastError, &j.LastErrorAt, &j.LastInstance, &j.Runs, &j.Failures); err != nil {
			return nil, err
		}
		recorded[j.Name] = j
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	jobs := make([]ScheduledJob, 0, len(jobCatalog))
	for _, entry := range jobCatalog {
		j := recorded[entry.name]
		j.Name, j.Label, j.Description, j.IntervalSeconds = entry.name, entry.label, entry.description, int(entry.interval/time.Second)
		j.RunsOn = "API"
		if entry.worker {
			j.RunsOn = "Worker"
			if s.system.EmbeddedWorker {
				j.RunsOn = "Worker and API"
			}
		}
		j.Status = jobStatus(j, entry.interval, time.Now())
		jobs = append(jobs, j)
	}
	return jobs, nil
}

// jobStatus: never ran, last run failed, overdue (missed two runs plus slack), or fine.
func jobStatus(j ScheduledJob, interval time.Duration, now time.Time) string {
	switch {
	case j.LastFinishedAt == nil:
		return "never"
	case j.LastErrorAt != nil && (j.LastSuccessAt == nil || j.LastErrorAt.After(*j.LastSuccessAt)):
		return "failing"
	case now.Sub(*j.LastFinishedAt) > 2*interval+2*time.Minute:
		return "late"
	default:
		return "ok"
	}
}

// Every stored file, per workspace. Signed copies count at their original's size, since theirs isn't recorded.
const storedFilesCTE = `
WITH custom AS (
  SELECT organization_id FROM organization_settings
  WHERE section = 'storage' AND config->>'enabled' = 'true' AND COALESCE(config->>'provider', '') NOT IN ('platform', '')
), files AS (
  SELECT e.organization_id, d.size_bytes AS bytes FROM documents d JOIN envelopes e ON e.id = d.envelope_id
  UNION ALL SELECT e.organization_id, d.size_bytes FROM documents d JOIN envelopes e ON e.id = d.envelope_id WHERE d.completed_object_key IS NOT NULL
  UNION ALL SELECT e.organization_id, COALESCE(a.size_bytes, 0) FROM envelope_attachments a JOIN envelopes e ON e.id = a.envelope_id WHERE a.object_key IS NOT NULL
  UNION ALL SELECT organization_id, size_bytes FROM pdf_security_files
), per_org AS (
  SELECT organization_id, sum(bytes)::bigint AS bytes, count(*) AS files FROM files GROUP BY organization_id
)`

func (s *Service) storageUsage(ctx context.Context) (StorageUsage, error) {
	usage := StorageUsage{Tables: []TableSize{}, TopWorkspaces: []WorkspaceStorage{}}
	if err := s.db.QueryRow(ctx, `SELECT pg_database_size(current_database())`).Scan(&usage.DatabaseBytes); err != nil {
		return usage, err
	}

	rows, err := s.db.Query(ctx, `SELECT relname, pg_total_relation_size(relid), n_live_tup FROM pg_stat_user_tables ORDER BY 2 DESC LIMIT 8`)
	if err != nil {
		return usage, err
	}
	for rows.Next() {
		var t TableSize
		if err := rows.Scan(&t.Name, &t.Bytes, &t.Rows); err != nil {
			rows.Close()
			return usage, err
		}
		usage.Tables = append(usage.Tables, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return usage, err
	}

	documents := FileCategory{Key: "documents", Label: "Uploaded documents"}
	signed := FileCategory{Key: "signed", Label: "Signed copies", Estimated: true}
	attachments := FileCategory{Key: "attachments", Label: "Attachments"}
	vault := FileCategory{Key: "vault", Label: "PDF security vault"}
	if err := s.db.QueryRow(ctx, `
SELECT
  (SELECT count(*) FROM documents), (SELECT COALESCE(sum(size_bytes), 0)::bigint FROM documents),
  (SELECT count(*) FROM documents WHERE completed_object_key IS NOT NULL), (SELECT COALESCE(sum(size_bytes), 0)::bigint FROM documents WHERE completed_object_key IS NOT NULL),
  (SELECT count(*) FROM envelope_attachments WHERE object_key IS NOT NULL), (SELECT COALESCE(sum(size_bytes), 0)::bigint FROM envelope_attachments WHERE object_key IS NOT NULL),
  (SELECT count(*) FROM pdf_security_files), (SELECT COALESCE(sum(size_bytes), 0)::bigint FROM pdf_security_files)`).
		Scan(&documents.Count, &documents.Bytes, &signed.Count, &signed.Bytes, &attachments.Count, &attachments.Bytes, &vault.Count, &vault.Bytes); err != nil {
		return usage, err
	}
	usage.Files = []FileCategory{documents, signed, attachments, vault}

	if err := s.db.QueryRow(ctx, storedFilesCTE+`
SELECT (SELECT count(*) FROM custom), COALESCE((SELECT sum(p.bytes) FROM per_org p JOIN custom c USING (organization_id)), 0)::bigint`).
		Scan(&usage.CustomBucketWorkspaces, &usage.CustomBucketBytes); err != nil {
		return usage, err
	}

	rows, err = s.db.Query(ctx, storedFilesCTE+`
SELECT o.id::text, o.name, p.bytes, p.files, c.organization_id IS NOT NULL
FROM per_org p
JOIN organizations o ON o.id = p.organization_id
LEFT JOIN custom c ON c.organization_id = p.organization_id
ORDER BY p.bytes DESC
LIMIT 5`)
	if err != nil {
		return usage, err
	}
	defer rows.Close()
	for rows.Next() {
		var w WorkspaceStorage
		if err := rows.Scan(&w.ID, &w.Name, &w.Bytes, &w.Files, &w.CustomBucket); err != nil {
			return usage, err
		}
		usage.TopWorkspaces = append(usage.TopWorkspaces, w)
	}
	return usage, rows.Err()
}
