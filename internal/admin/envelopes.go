package admin

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"signing-platform/internal/send"
	"signing-platform/internal/supportaccess"
)

// ---- Lookup ----

type EnvelopeSummary struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Status         string     `json:"status"`
	IsTemplate     bool       `json:"isTemplate"`
	WorkspaceID    string     `json:"workspaceId"`
	WorkspaceName  string     `json:"workspaceName"`
	SenderName     string     `json:"senderName"`
	SenderEmail    string     `json:"senderEmail"`
	RecipientCount int        `json:"recipientCount"`
	CompletedCount int        `json:"completedCount"`
	ExpiresAt      *time.Time `json:"expiresAt"`
	SentAt         *time.Time `json:"sentAt"`
	CompletedAt    *time.Time `json:"completedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// Signers and approvers count toward progress; viewers and CCs only receive copies.
const envelopeSummaryColumns = `
  e.id::text, e.title, e.status::text, e.is_template, o.id::text, o.name, u.name, u.email,
  (SELECT count(*) FROM recipients r WHERE r.envelope_id = e.id AND r.role IN ('signer', 'approver')),
  (SELECT count(*) FROM recipients r WHERE r.envelope_id = e.id AND r.role IN ('signer', 'approver') AND r.status = 'completed'),
  e.expires_at, e.sent_at, e.completed_at, e.created_at, e.updated_at`

const envelopeFrom = ` FROM envelopes e JOIN organizations o ON o.id = e.organization_id JOIN users u ON u.id = e.created_by`

func scanEnvelopeSummary(row pgx.Row) (EnvelopeSummary, error) {
	var e EnvelopeSummary
	err := row.Scan(&e.ID, &e.Title, &e.Status, &e.IsTemplate, &e.WorkspaceID, &e.WorkspaceName, &e.SenderName, &e.SenderEmail,
		&e.RecipientCount, &e.CompletedCount, &e.ExpiresAt, &e.SentAt, &e.CompletedAt, &e.CreatedAt, &e.UpdatedAt)
	return e, err
}

var envelopeStatuses = map[string]bool{"draft": true, "in_progress": true, "completed": true, "voided": true, "expired": true}

// EnvelopeStatusFilter keeps only known envelope statuses.
func EnvelopeStatusFilter(value string) string {
	if envelopeStatuses[value] {
		return value
	}
	return ""
}

// uuidOrNil returns value when it is a UUID, so lookups by ID can use the primary key.
func uuidOrNil(value string) *string {
	if _, err := uuid.Parse(value); err != nil {
		return nil
	}
	return &value
}

// ListEnvelopes searches by envelope ID, external ID, title or a recipient's email.
// Templates are left out unless looked up by their exact ID.
func (s *Service) ListEnvelopes(ctx context.Context, query, status, workspaceID string, page Page) (List[EnvelopeSummary], error) {
	page = page.normalize()
	query = strings.TrimSpace(query)
	where := ` WHERE ($1 = '' OR e.id = $3::uuid OR e.external_id = $1 OR e.title ILIKE $2 OR EXISTS (
    SELECT 1 FROM recipients r WHERE r.envelope_id = e.id AND r.email ILIKE $2))
  AND (NOT e.is_template OR e.id = $3::uuid)
  AND ($4 = '' OR e.status::text = $4)
  AND ($5::uuid IS NULL OR e.organization_id = $5::uuid)`
	args := []any{query, searchPattern(query), uuidOrNil(query), status, uuidOrNil(workspaceID)}

	result := List[EnvelopeSummary]{Items: []EnvelopeSummary{}, Page: page.Number, PageSize: page.Size}
	if strings.TrimSpace(workspaceID) != "" && uuidOrNil(workspaceID) == nil {
		return result, nil
	}
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+envelopeFrom+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `SELECT `+envelopeSummaryColumns+envelopeFrom+where+` ORDER BY e.updated_at DESC, e.id LIMIT $6 OFFSET $7`,
		append(args, page.Size, page.offset())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		e, err := scanEnvelopeSummary(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, e)
	}
	return result, rows.Err()
}

type EnvelopeRecipient struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Email          string     `json:"email"`
	Role           string     `json:"role"`
	Status         string     `json:"status"`
	SigningOrder   int        `json:"signingOrder"`
	SentAt         *time.Time `json:"sentAt"`
	ViewedAt       *time.Time `json:"viewedAt"`
	CompletedAt    *time.Time `json:"completedAt"`
	DeclinedAt     *time.Time `json:"declinedAt"`
	DeclineReason  *string    `json:"declineReason"`
	LastRemindedAt *time.Time `json:"lastRemindedAt"`
}

// EnvelopeDocument is file metadata only: admins never see document contents.
type EnvelopeDocument struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	PageCount int    `json:"pageCount"`
	SizeBytes int64  `json:"sizeBytes"`
}

type EnvelopeEvent struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	ActorName  *string        `json:"actorName"`
	Recipient  *string        `json:"recipientName"`
	Metadata   map[string]any `json:"metadata"`
	OccurredAt time.Time      `json:"occurredAt"`
}

type EnvelopeJob struct {
	ID             string     `json:"id"`
	Kind           string     `json:"kind"`
	Status         string     `json:"status"`
	RecipientEmail string     `json:"recipientEmail"`
	Attempts       int        `json:"attempts"`
	LastError      *string    `json:"lastError"`
	AvailableAt    time.Time  `json:"availableAt"`
	SentAt         *time.Time `json:"sentAt"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type AdminAction struct {
	ID         string    `json:"id"`
	Action     string    `json:"action"`
	AdminName  *string   `json:"adminName"`
	AdminEmail *string   `json:"adminEmail"`
	Reason     *string   `json:"reason"`
	OccurredAt time.Time `json:"occurredAt"`
}

type EnvelopeDetail struct {
	EnvelopeSummary
	ExternalID         *string             `json:"externalId"`
	DistributionMethod string              `json:"distributionMethod"`
	AutoReminders      bool                `json:"autoReminders"`
	RequirePasscode    bool                `json:"requirePasscode"`
	Language           string              `json:"language"`
	Timezone           string              `json:"timezone"`
	Documents          []EnvelopeDocument  `json:"documents"`
	Recipients         []EnvelopeRecipient `json:"recipients"`
	Events             []EnvelopeEvent     `json:"events"`
	Jobs               []EnvelopeJob       `json:"jobs"`
	AdminActions       []AdminAction       `json:"adminActions"`
	// SupportAccessUntil is set while the workspace lets support open its documents.
	SupportAccessUntil *time.Time `json:"supportAccessUntil"`
}

func (s *Service) GetEnvelope(ctx context.Context, id string) (EnvelopeDetail, error) {
	if uuidOrNil(id) == nil {
		return EnvelopeDetail{}, ErrNotFound
	}
	var d EnvelopeDetail
	err := s.db.QueryRow(ctx, `SELECT `+envelopeSummaryColumns+`, e.external_id, e.distribution_method, e.auto_reminders, e.require_passcode, e.language, e.timezone`+envelopeFrom+` WHERE e.id = $1::uuid`, id).Scan(
		&d.ID, &d.Title, &d.Status, &d.IsTemplate, &d.WorkspaceID, &d.WorkspaceName, &d.SenderName, &d.SenderEmail,
		&d.RecipientCount, &d.CompletedCount, &d.ExpiresAt, &d.SentAt, &d.CompletedAt, &d.CreatedAt, &d.UpdatedAt,
		&d.ExternalID, &d.DistributionMethod, &d.AutoReminders, &d.RequirePasscode, &d.Language, &d.Timezone)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnvelopeDetail{}, ErrNotFound
	}
	if err != nil {
		return EnvelopeDetail{}, err
	}

	if d.Documents, err = collect(ctx, s, `SELECT id::text, filename, page_count, size_bytes FROM documents WHERE envelope_id = $1::uuid ORDER BY position`, id,
		func(row pgx.Rows, v *EnvelopeDocument) error {
			return row.Scan(&v.ID, &v.Filename, &v.PageCount, &v.SizeBytes)
		}); err != nil {
		return d, err
	}
	if d.Recipients, err = collect(ctx, s, `
SELECT id::text, name, email, role::text, status::text, signing_order, sent_at, viewed_at, completed_at, declined_at, decline_reason, last_reminded_at
FROM recipients WHERE envelope_id = $1::uuid ORDER BY signing_order, created_at`, id,
		func(row pgx.Rows, v *EnvelopeRecipient) error {
			return row.Scan(&v.ID, &v.Name, &v.Email, &v.Role, &v.Status, &v.SigningOrder, &v.SentAt, &v.ViewedAt, &v.CompletedAt, &v.DeclinedAt, &v.DeclineReason, &v.LastRemindedAt)
		}); err != nil {
		return d, err
	}
	if d.Events, err = collect(ctx, s, `
SELECT a.id::text, a.event_type, u.name, r.name, a.metadata, a.occurred_at
FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN recipients r ON r.id = a.recipient_id
WHERE a.envelope_id = $1::uuid ORDER BY a.occurred_at DESC, a.id LIMIT 200`, id,
		func(row pgx.Rows, v *EnvelopeEvent) error {
			return row.Scan(&v.ID, &v.Type, &v.ActorName, &v.Recipient, &v.Metadata, &v.OccurredAt)
		}); err != nil {
		return d, err
	}
	if d.Jobs, err = collect(ctx, s, `
SELECT j.id::text, j.kind, j.status, r.email, j.attempts, j.last_error, j.available_at, j.sent_at, j.created_at
FROM notification_jobs j JOIN recipients r ON r.id = j.recipient_id
WHERE j.envelope_id = $1::uuid ORDER BY j.created_at DESC LIMIT 100`, id,
		func(row pgx.Rows, v *EnvelopeJob) error {
			return row.Scan(&v.ID, &v.Kind, &v.Status, &v.RecipientEmail, &v.Attempts, &v.LastError, &v.AvailableAt, &v.SentAt, &v.CreatedAt)
		}); err != nil {
		return d, err
	}
	if grant, err := supportaccess.Current(ctx, s.db, d.WorkspaceID); err != nil {
		return d, err
	} else if grant != nil {
		d.SupportAccessUntil = &grant.ExpiresAt
	}
	d.AdminActions, err = collect(ctx, s, `
SELECT a.id::text, a.action, u.name, u.email, a.reason, a.occurred_at
FROM admin_audit_events a LEFT JOIN users u ON u.id = a.admin_user_id
WHERE a.target_type = 'envelope' AND a.target_id = $1 ORDER BY a.occurred_at DESC LIMIT 50`, id,
		func(row pgx.Rows, v *AdminAction) error {
			return row.Scan(&v.ID, &v.Action, &v.AdminName, &v.AdminEmail, &v.Reason, &v.OccurredAt)
		})
	return d, err
}

// collect runs a query with one argument and scans every row into a non-nil slice.
func collect[T any](ctx context.Context, s *Service, sql string, arg any, scan func(pgx.Rows, *T) error) ([]T, error) {
	return queryAll(ctx, s, sql, []any{arg}, scan)
}

// queryAll runs a query with any number of arguments and scans every row into a non-nil slice.
func queryAll[T any](ctx context.Context, s *Service, sql string, args []any, scan func(pgx.Rows, *T) error) ([]T, error) {
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []T{}
	for rows.Next() {
		var item T
		if err := scan(rows, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ---- Actions ----

// ActionError is a rejected admin action; its message is safe to show in the admin app.
type ActionError struct {
	Status  int
	Code    string
	Message string
}

func (e *ActionError) Error() string { return e.Message }

func conflict(code, message string) error {
	return &ActionError{Status: http.StatusConflict, Code: code, Message: message}
}

func invalid(code, message string) error {
	return &ActionError{Status: http.StatusBadRequest, Code: code, Message: message}
}

// Actor is the admin making a change, with request details for the audit log.
type Actor struct {
	Admin     Admin
	IPAddress string
	UserAgent string
}

func (a Actor) target(targetType, action, targetID, reason string, before, after any) AuditEvent {
	userID := a.Admin.UserID
	return AuditEvent{AdminUserID: &userID, Action: action, TargetType: targetType, TargetID: targetID, Reason: reason,
		Before: before, After: after, IPAddress: a.IPAddress, UserAgent: a.UserAgent}
}

func (a Actor) audit(action, targetID, reason string, before, after any) AuditEvent {
	return a.target("envelope", action, targetID, reason, before, after)
}

// supportEvent marks entries in the customer's envelope timeline as made by Signet support.
var supportEvent = map[string]any{"support": true}

const maxReasonLength = 500

func cleanReason(reason string, required bool) (string, error) {
	reason = strings.TrimSpace(reason)
	if required && reason == "" {
		return "", invalid("reason_required", "Add a reason. It's saved in the audit log.")
	}
	if len(reason) > maxReasonLength {
		return "", invalid("reason_too_long", "Keep the reason under 500 characters.")
	}
	return reason, nil
}

type lockedEnvelope struct {
	status     string
	isTemplate bool
	expiresAt  *time.Time
}

func lockEnvelope(ctx context.Context, tx pgx.Tx, id string) (lockedEnvelope, error) {
	var e lockedEnvelope
	if uuidOrNil(id) == nil {
		return e, ErrNotFound
	}
	err := tx.QueryRow(ctx, `SELECT status::text, is_template, expires_at FROM envelopes WHERE id = $1::uuid FOR UPDATE`, id).Scan(&e.status, &e.isTemplate, &e.expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

type ResendResult struct {
	RemindersQueued int `json:"remindersQueued"`
}

// ResendEnvelope emails a fresh signing link to every recipient still waiting, like the sender's "Remind" button.
func (s *Service) ResendEnvelope(ctx context.Context, actor Actor, id, reason string) (ResendResult, error) {
	if s.generate == nil {
		return ResendResult{}, errors.New("signing links are not configured for the admin service")
	}
	reason, err := cleanReason(reason, false)
	if err != nil {
		return ResendResult{}, err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return ResendResult{}, err
	}
	defer tx.Rollback(ctx)

	envelope, err := lockEnvelope(ctx, tx, id)
	if err != nil {
		return ResendResult{}, err
	}
	if envelope.status != "in_progress" {
		return ResendResult{}, conflict("not_in_progress", "Only envelopes that are in progress can be resent.")
	}
	queued, err := send.RemindInTx(ctx, tx, id, nil, supportEvent, s.generate)
	if errors.Is(err, send.ErrNothingToRemind) {
		return ResendResult{}, conflict("nothing_to_resend", "Nobody is waiting to sign this envelope right now.")
	}
	if err != nil {
		return ResendResult{}, err
	}
	if err := RecordAudit(ctx, tx, actor.audit("envelope.resend", id, reason, nil, map[string]int{"reminders": queued})); err != nil {
		return ResendResult{}, err
	}
	return ResendResult{RemindersQueued: queued}, tx.Commit(ctx)
}

type ExtendResult struct {
	ExpiresAt time.Time `json:"expiresAt"`
	Reopened  bool      `json:"reopened"`
}

// Limits for a new expiration date.
const (
	minExtension = time.Hour
	maxExtension = 365 * 24 * time.Hour
)

// ExtendEnvelope moves the expiration date later. An expired envelope is reopened, and existing
// signing links stay valid until the new date.
func (s *Service) ExtendEnvelope(ctx context.Context, actor Actor, id string, expiresAt time.Time, reason string) (ExtendResult, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return ExtendResult{}, err
	}
	now := time.Now()
	if expiresAt.Before(now.Add(minExtension)) {
		return ExtendResult{}, invalid("invalid_expiry", "Pick a date at least an hour from now.")
	}
	if expiresAt.After(now.Add(maxExtension)) {
		return ExtendResult{}, invalid("invalid_expiry", "Pick a date within the next year.")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return ExtendResult{}, err
	}
	defer tx.Rollback(ctx)

	envelope, err := lockEnvelope(ctx, tx, id)
	if err != nil {
		return ExtendResult{}, err
	}
	if envelope.isTemplate || (envelope.status != "in_progress" && envelope.status != "expired") {
		return ExtendResult{}, conflict("not_extendable", "Only envelopes that are in progress or expired can be extended.")
	}
	if envelope.status == "in_progress" && envelope.expiresAt == nil {
		return ExtendResult{}, conflict("no_expiry", "This envelope doesn't expire, so there's nothing to extend.")
	}
	if envelope.expiresAt != nil && !expiresAt.After(*envelope.expiresAt) {
		return ExtendResult{}, invalid("invalid_expiry", "Pick a date later than the current expiration.")
	}

	if _, err := tx.Exec(ctx, `UPDATE envelopes SET expires_at = $2, status = 'in_progress', updated_at = now() WHERE id = $1::uuid`, id, expiresAt); err != nil {
		return ExtendResult{}, err
	}
	if _, err := tx.Exec(ctx, `
UPDATE signing_tokens t SET expires_at = GREATEST(t.expires_at, $2)
FROM recipients r WHERE r.id = t.recipient_id AND r.envelope_id = $1::uuid AND t.revoked_at IS NULL`, id, expiresAt); err != nil {
		return ExtendResult{}, err
	}
	reopened := envelope.status == "expired"
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, event_type, metadata) VALUES ($1::uuid, 'envelope.extended', jsonb_build_object('support', true, 'expiresAt', $2::timestamptz, 'previousExpiresAt', $3::timestamptz, 'reopened', $4::boolean))`,
		id, expiresAt, envelope.expiresAt, reopened); err != nil {
		return ExtendResult{}, err
	}
	before := map[string]any{"status": envelope.status, "expiresAt": envelope.expiresAt}
	after := map[string]any{"status": "in_progress", "expiresAt": expiresAt}
	if err := RecordAudit(ctx, tx, actor.audit("envelope.extend", id, reason, before, after)); err != nil {
		return ExtendResult{}, err
	}
	return ExtendResult{ExpiresAt: expiresAt, Reopened: reopened}, tx.Commit(ctx)
}

// VoidEnvelope cancels an envelope that is in progress and revokes every signing link, like the sender's "Void".
func (s *Service) VoidEnvelope(ctx context.Context, actor Actor, id, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	envelope, err := lockEnvelope(ctx, tx, id)
	if err != nil {
		return err
	}
	if envelope.status != "in_progress" {
		return conflict("not_in_progress", "Only envelopes that are in progress can be voided.")
	}
	if _, err := tx.Exec(ctx, `UPDATE envelopes SET status = 'voided', updated_at = now() WHERE id = $1::uuid`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE signing_tokens t SET revoked_at = now() FROM recipients r WHERE r.id = t.recipient_id AND r.envelope_id = $1::uuid AND t.revoked_at IS NULL`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events(envelope_id, event_type, metadata) VALUES ($1::uuid, 'envelope.voided', '{"support": true}'::jsonb)`, id); err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, actor.audit("envelope.void", id, reason, map[string]string{"status": envelope.status}, map[string]string{"status": "voided"})); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
