package admin

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/notify"
)

// ---- Email queue ----

// A job's state as the admin app shows it, worked out from the worker's own columns:
//
//	sent      delivered
//	queued    waiting for the worker, or being sent right now
//	retrying  failed, and the worker will try again on its own
//	gave_up   failed for good: out of attempts or a permanent error (the worker parks those far in the future)
//	stuck     claimed by a worker that never finished
const jobStateSQL = `CASE
  WHEN j.status = 'sent' THEN 'sent'
  WHEN j.status = 'failed' AND (j.attempts >= $1 OR j.available_at > now() + interval '10 years') THEN 'gave_up'
  WHEN j.status = 'failed' THEN 'retrying'
  WHEN j.status = 'processing' AND j.updated_at < now() - interval '5 minutes' THEN 'stuck'
  ELSE 'queued' END`

var jobStates = map[string]bool{"queued": true, "retrying": true, "gave_up": true, "stuck": true, "sent": true}

// JobStateFilter keeps known states and "attention" (gave_up or stuck).
func JobStateFilter(value string) string {
	if jobStates[value] || value == "attention" {
		return value
	}
	return ""
}

// Signing links in invitations and reminders last at least this long; older ones may no longer work.
const signingLinkLifetime = 30 * 24 * time.Hour

type EmailJob struct {
	ID             string     `json:"id"`
	Kind           string     `json:"kind"`
	State          string     `json:"state"`
	Attempts       int        `json:"attempts"`
	MaxAttempts    int        `json:"maxAttempts"`
	LastError      *string    `json:"lastError"`
	RecipientName  string     `json:"recipientName"`
	RecipientEmail string     `json:"recipientEmail"`
	EnvelopeID     string     `json:"envelopeId"`
	EnvelopeTitle  string     `json:"envelopeTitle"`
	EnvelopeStatus string     `json:"envelopeStatus"`
	WorkspaceID    string     `json:"workspaceId"`
	WorkspaceName  string     `json:"workspaceName"`
	NextAttemptAt  *time.Time `json:"nextAttemptAt"`
	SentAt         *time.Time `json:"sentAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	// Why Retry is refused, or empty when it is allowed.
	RetryBlocked string `json:"retryBlocked"`
}

// The worker sets available_at on every failure; only "retrying" jobs have a meaningful next attempt.
const emailJobColumns = `
  j.id::text, j.kind, ` + jobStateSQL + `, j.attempts, j.last_error, r.name, r.email,
  e.id::text, e.title, e.status::text, o.id::text, o.name,
  j.available_at, j.sent_at, j.created_at, j.updated_at`

const emailJobFrom = `
FROM notification_jobs j
JOIN recipients r ON r.id = j.recipient_id
JOIN envelopes e ON e.id = j.envelope_id
JOIN organizations o ON o.id = e.organization_id`

func scanEmailJob(row pgx.Row) (EmailJob, error) {
	var j EmailJob
	var available time.Time
	err := row.Scan(&j.ID, &j.Kind, &j.State, &j.Attempts, &j.LastError, &j.RecipientName, &j.RecipientEmail,
		&j.EnvelopeID, &j.EnvelopeTitle, &j.EnvelopeStatus, &j.WorkspaceID, &j.WorkspaceName,
		&available, &j.SentAt, &j.CreatedAt, &j.UpdatedAt)
	if err != nil {
		return j, err
	}
	j.MaxAttempts = notify.MaxAttempts
	if j.State == "retrying" {
		j.NextAttemptAt = &available
	}
	j.RetryBlocked = retryBlocked(j, time.Now())
	return j, nil
}

// retryBlocked explains why retrying would be pointless or wrong, so the app can say so up front.
func retryBlocked(j EmailJob, now time.Time) string {
	switch j.State {
	case "sent":
		return "This email was delivered."
	case "queued":
		return "This email is already waiting to be sent."
	}
	switch j.Kind {
	case "invitation", "reminder":
		if j.EnvelopeStatus != "in_progress" {
			return "The envelope is no longer in progress, so the signing link in this email doesn't work."
		}
		if now.Sub(j.CreatedAt) > signingLinkLifetime {
			return "The signing link in this email may have expired. Use Resend on the envelope to send a fresh one."
		}
	case "completion":
		if j.EnvelopeStatus != "completed" {
			return "The envelope isn't completed, so there's no signed copy to send."
		}
	}
	return ""
}

type JobCounts struct {
	Queued    int `json:"queued"`
	Retrying  int `json:"retrying"`
	GaveUp    int `json:"gaveUp"`
	Stuck     int `json:"stuck"`
	Sent24h   int `json:"sent24h"`
	Failed24h int `json:"failed24h"`
}

type EmailJobList struct {
	List[EmailJob]
	Counts JobCounts `json:"counts"`
}

// ListEmailJobs searches by recipient email, envelope title, envelope ID or job ID, filtered by state.
// Jobs that need attention come first, then the most recently changed.
func (s *Service) ListEmailJobs(ctx context.Context, query, state, kind string, page Page) (EmailJobList, error) {
	page = page.normalize()
	query = strings.TrimSpace(query)
	where := ` WHERE ($2 = '' OR j.id = $4::uuid OR e.id = $4::uuid OR r.email ILIKE $3 OR e.title ILIKE $3)
  AND ($5 = '' OR (` + jobStateSQL + `) = $5 OR ($5 = 'attention' AND (` + jobStateSQL + `) IN ('gave_up', 'stuck')))
  AND ($6 = '' OR j.kind = $6)`
	args := []any{notify.MaxAttempts, query, searchPattern(query), uuidOrNil(query), state, strings.TrimSpace(kind)}

	result := EmailJobList{List: List[EmailJob]{Items: []EmailJob{}, Page: page.Number, PageSize: page.Size}}
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+emailJobFrom+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `SELECT `+emailJobColumns+emailJobFrom+where+`
ORDER BY CASE `+jobStateSQL+` WHEN 'gave_up' THEN 0 WHEN 'stuck' THEN 1 WHEN 'retrying' THEN 2 WHEN 'queued' THEN 3 ELSE 4 END, j.updated_at DESC, j.id
LIMIT $7 OFFSET $8`, append(args, page.Size, page.offset())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		j, err := scanEmailJob(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, j)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	result.Counts, err = s.jobCounts(ctx)
	return result, err
}

func (s *Service) jobCounts(ctx context.Context) (JobCounts, error) {
	var c JobCounts
	err := s.db.QueryRow(ctx, `
SELECT
  count(*) FILTER (WHERE state = 'queued'),
  count(*) FILTER (WHERE state = 'retrying'),
  count(*) FILTER (WHERE state = 'gave_up'),
  count(*) FILTER (WHERE state = 'stuck'),
  (SELECT count(*) FROM notification_jobs WHERE sent_at > now() - interval '24 hours'),
  (SELECT count(DISTINCT job_id) FROM notification_deliveries WHERE status = 'failed' AND occurred_at > now() - interval '24 hours')
FROM (SELECT `+jobStateSQL+` AS state FROM notification_jobs j WHERE j.status <> 'sent') jobs`, notify.MaxAttempts).
		Scan(&c.Queued, &c.Retrying, &c.GaveUp, &c.Stuck, &c.Sent24h, &c.Failed24h)
	return c, err
}

type JobAttempt struct {
	Attempt    int       `json:"attempt"`
	Status     string    `json:"status"`
	Provider   string    `json:"provider"`
	Error      *string   `json:"error"`
	OccurredAt time.Time `json:"occurredAt"`
}

type EmailJobDetail struct {
	EmailJob
	History      []JobAttempt  `json:"history"`
	AdminActions []AdminAction `json:"adminActions"`
}

func (s *Service) GetEmailJob(ctx context.Context, id string) (EmailJobDetail, error) {
	if uuidOrNil(id) == nil {
		return EmailJobDetail{}, ErrNotFound
	}
	job, err := scanEmailJob(s.db.QueryRow(ctx, `SELECT `+emailJobColumns+emailJobFrom+` WHERE j.id = $2::uuid`, notify.MaxAttempts, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return EmailJobDetail{}, ErrNotFound
	}
	if err != nil {
		return EmailJobDetail{}, err
	}
	detail := EmailJobDetail{EmailJob: job}
	if detail.History, err = collect(ctx, s, `
SELECT attempt, status, provider, error, occurred_at FROM notification_deliveries
WHERE job_id = $1::uuid ORDER BY occurred_at DESC LIMIT 50`, id,
		func(row pgx.Rows, v *JobAttempt) error {
			return row.Scan(&v.Attempt, &v.Status, &v.Provider, &v.Error, &v.OccurredAt)
		}); err != nil {
		return detail, err
	}
	detail.AdminActions, err = collect(ctx, s, `
SELECT a.id::text, a.action, u.name, u.email, a.reason, a.occurred_at
FROM admin_audit_events a LEFT JOIN users u ON u.id = a.admin_user_id
WHERE a.target_type = 'job' AND a.target_id = $1 ORDER BY a.occurred_at DESC LIMIT 20`, id,
		func(row pgx.Rows, v *AdminAction) error {
			return row.Scan(&v.ID, &v.Action, &v.AdminName, &v.AdminEmail, &v.Reason, &v.OccurredAt)
		})
	return detail, err
}

// requeue puts a job back in line with a fresh set of attempts. The last error stays for reference.
const requeueSQL = `UPDATE notification_jobs SET status = 'pending', attempts = 0, available_at = now(), updated_at = now() WHERE id = $1::uuid`

// RetryEmailJob requeues one failed or stuck email.
func (s *Service) RetryEmailJob(ctx context.Context, actor Actor, id, reason string) (EmailJob, error) {
	reason, err := cleanReason(reason, false)
	if err != nil {
		return EmailJob{}, err
	}
	if uuidOrNil(id) == nil {
		return EmailJob{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return EmailJob{}, err
	}
	defer tx.Rollback(ctx)

	// Locking the job row keeps a worker from claiming it while it is being requeued.
	job, err := scanEmailJob(tx.QueryRow(ctx, `SELECT `+emailJobColumns+emailJobFrom+` WHERE j.id = $2::uuid FOR UPDATE OF j`, notify.MaxAttempts, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return EmailJob{}, ErrNotFound
	}
	if err != nil {
		return EmailJob{}, err
	}
	if job.RetryBlocked != "" {
		return EmailJob{}, conflict("not_retryable", job.RetryBlocked)
	}
	if _, err := tx.Exec(ctx, requeueSQL, id); err != nil {
		return EmailJob{}, err
	}
	before := map[string]any{"state": job.State, "attempts": job.Attempts}
	if err := RecordAudit(ctx, tx, actor.target("job", "job.retry", id, reason, before, map[string]any{"state": "queued", "attempts": 0})); err != nil {
		return EmailJob{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return EmailJob{}, err
	}
	job.State, job.Attempts, job.NextAttemptAt, job.RetryBlocked = "queued", 0, nil, "This email is already waiting to be sent."
	return job, nil
}

type BulkRetryResult struct {
	Retried int `json:"retried"`
	Skipped int `json:"skipped"`
}

// maxBulkRetry bounds one "Retry all" so a bad outage can't requeue an unbounded backlog in one transaction.
const maxBulkRetry = 500

// RetryStuckEmailJobs requeues every email that gave up or got stuck, skipping ones that can't be retried.
func (s *Service) RetryStuckEmailJobs(ctx context.Context, actor Actor, reason string) (BulkRetryResult, error) {
	reason, err := cleanReason(reason, false)
	if err != nil {
		return BulkRetryResult{}, err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return BulkRetryResult{}, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `SELECT `+emailJobColumns+emailJobFrom+` WHERE (`+jobStateSQL+`) IN ('gave_up', 'stuck')
ORDER BY j.updated_at LIMIT $2 FOR UPDATE OF j SKIP LOCKED`, notify.MaxAttempts, maxBulkRetry)
	if err != nil {
		return BulkRetryResult{}, err
	}
	var result BulkRetryResult
	retry := []string{}
	for rows.Next() {
		job, err := scanEmailJob(rows)
		if err != nil {
			rows.Close()
			return BulkRetryResult{}, err
		}
		if job.RetryBlocked != "" {
			result.Skipped++
			continue
		}
		retry = append(retry, job.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return BulkRetryResult{}, err
	}
	if len(retry) == 0 {
		return result, nil
	}
	if _, err := tx.Exec(ctx, `UPDATE notification_jobs SET status = 'pending', attempts = 0, available_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])`, retry); err != nil {
		return BulkRetryResult{}, err
	}
	result.Retried = len(retry)
	after := map[string]any{"retried": result.Retried, "skipped": result.Skipped, "jobIds": retry}
	if err := RecordAudit(ctx, tx, actor.target("job", "job.retry_all", "all", reason, nil, after)); err != nil {
		return BulkRetryResult{}, err
	}
	return result, tx.Commit(ctx)
}
