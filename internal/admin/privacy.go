package admin

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/billing"
	"signing-platform/internal/document"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/supportaccess"
)

// WithLifecycle lets admins cancel or carry out workspace deletions.
func (s *Service) WithLifecycle(l *lifecycle.Service) *Service {
	s.lifecycle = l
	return s
}

// WithDocuments lets admins open document files while a workspace has support access on.
func (s *Service) WithDocuments(d *document.Service) *Service {
	s.documents = d
	return s
}

// ---- Workspace privacy state ----

type WorkspaceRetention struct {
	lifecycle.RetentionPolicy
	Active bool                     `json:"active"`
	Runs   []lifecycle.RetentionRun `json:"runs"`
}

type WorkspacePrivacy struct {
	SupportAccess *supportaccess.Grant       `json:"supportAccess"`
	Deletion      *lifecycle.DeletionRequest `json:"deletion"`
	Retention     WorkspaceRetention         `json:"retention"`
}

func (s *Service) workspacePrivacy(ctx context.Context, workspaceID string) (WorkspacePrivacy, error) {
	var p WorkspacePrivacy
	var err error
	if p.SupportAccess, err = supportaccess.Current(ctx, s.db, workspaceID); err != nil {
		return p, err
	}
	if p.Deletion, err = lifecycle.PendingDeletion(ctx, s.db, workspaceID); err != nil {
		return p, err
	}
	if p.Retention.RetentionPolicy, err = lifecycle.LoadRetention(ctx, s.db, workspaceID); err != nil {
		return p, err
	}
	p.Retention.Active = p.Retention.RetentionPolicy.Active()
	p.Retention.Runs, err = collect(ctx, s, `SELECT envelopes_deleted, files_deleted, error, ran_at FROM retention_runs WHERE organization_id = $1::uuid ORDER BY ran_at DESC LIMIT 5`, workspaceID,
		func(row pgx.Rows, v *lifecycle.RetentionRun) error {
			return row.Scan(&v.EnvelopesDeleted, &v.FilesDeleted, &v.Error, &v.RanAt)
		})
	return p, err
}

// ---- Documents, with the customer's permission ----

var ErrNoSupportAccess = &ActionError{Status: http.StatusForbidden, Code: "no_support_access", Message: "This workspace hasn't given Signet support access to its documents. Ask an owner or admin to turn it on in Settings → Data & privacy."}

// OpenDocument returns a document file while the workspace has support access on. Every view is
// recorded in the customer's audit trail (as Signet support) and in the admin audit log.
func (s *Service) OpenDocument(ctx context.Context, actor Actor, envelopeID, documentID string, signed bool) (document.StoredDocument, io.ReadCloser, error) {
	if s.documents == nil {
		return document.StoredDocument{}, nil, errors.New("documents are not configured for the admin service")
	}
	if uuidOrNil(envelopeID) == nil || uuidOrNil(documentID) == nil {
		return document.StoredDocument{}, nil, ErrNotFound
	}
	var orgID string
	err := s.db.QueryRow(ctx, `SELECT organization_id::text FROM envelopes WHERE id = $1::uuid`, envelopeID).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return document.StoredDocument{}, nil, ErrNotFound
	}
	if err != nil {
		return document.StoredDocument{}, nil, err
	}
	grant, err := supportaccess.Current(ctx, s.db, orgID)
	if err != nil {
		return document.StoredDocument{}, nil, err
	}
	if grant == nil {
		return document.StoredDocument{}, nil, ErrNoSupportAccess
	}
	stored, body, err := s.documents.Download(ctx, orgID, envelopeID, documentID, signed)
	if err != nil {
		if errors.Is(err, document.ErrNotFound) {
			return document.StoredDocument{}, nil, ErrNotFound
		}
		return document.StoredDocument{}, nil, err
	}
	version := "original"
	if signed {
		version = "signed"
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		body.Close()
		return document.StoredDocument{}, nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events (envelope_id, event_type, metadata) VALUES ($1::uuid, 'envelope.support_viewed', jsonb_build_object('support', true, 'documentId', $2::text, 'filename', $3::text, 'version', $4::text))`,
		envelopeID, documentID, stored.Filename, version); err != nil {
		body.Close()
		return document.StoredDocument{}, nil, err
	}
	event := actor.target("envelope", "envelope.document_view", envelopeID, "", nil, map[string]any{"documentId": documentID, "filename": stored.Filename, "version": version, "grantId": grant.ID})
	if err := RecordAudit(ctx, tx, event); err != nil {
		body.Close()
		return document.StoredDocument{}, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		body.Close()
		return document.StoredDocument{}, nil, err
	}
	return stored, body, nil
}

// ---- Workspace deletions ----

var deletionStatuses = map[string]bool{"scheduled": true, "failed": true, "completed": true, "canceled": true}

// ListDeletions lists deletion requests, soonest due first for open ones.
func (s *Service) ListDeletions(ctx context.Context, status string, page Page) (List[lifecycle.DeletionRequest], error) {
	page = page.normalize()
	if !deletionStatuses[status] && status != "open" {
		status = ""
	}
	where := ` WHERE ($1 = '' OR status = $1 OR ($1 = 'open' AND status IN ('scheduled', 'failed')))`
	result := List[lifecycle.DeletionRequest]{Items: []lifecycle.DeletionRequest{}, Page: page.Number, PageSize: page.Size}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM workspace_deletion_requests`+where, status).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `
SELECT id::text, organization_id::text, organization_name, requested_by_email, status, scheduled_for, canceled_at, completed_at, error, envelopes_deleted, files_deleted, created_at
FROM workspace_deletion_requests`+where+`
ORDER BY (status IN ('scheduled', 'failed')) DESC, CASE WHEN status IN ('scheduled', 'failed') THEN scheduled_for END, created_at DESC
LIMIT $2 OFFSET $3`, status, page.Size, page.offset())
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		r, err := lifecycle.ScanRequest(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, r)
	}
	return result, rows.Err()
}

// CancelDeletion keeps a workspace the owner asked to delete (e.g. they changed their mind by email).
func (s *Service) CancelDeletion(ctx context.Context, actor Actor, requestID, reason string) (lifecycle.DeletionRequest, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	if uuidOrNil(requestID) == nil {
		return lifecycle.DeletionRequest{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	defer tx.Rollback(ctx)
	canceled, err := lifecycle.CancelDeletion(ctx, tx, requestID, actor.Admin.UserID)
	if errors.Is(err, lifecycle.ErrNoRequest) {
		return lifecycle.DeletionRequest{}, conflict("not_open", "This request isn't scheduled any more.")
	}
	if err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	if err := RecordAudit(ctx, tx, actor.target("deletion", "deletion.cancel", requestID, reason, map[string]string{"status": "scheduled"}, map[string]any{"status": "canceled", "workspace": canceled.OrganizationName})); err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	return canceled, tx.Commit(ctx)
}

// RunDeletionNow deletes the workspace straight away instead of waiting out the grace period.
func (s *Service) RunDeletionNow(ctx context.Context, actor Actor, requestID, reason string) (lifecycle.DeletionRequest, error) {
	if s.lifecycle == nil {
		return lifecycle.DeletionRequest{}, errors.New("lifecycle is not configured for the admin service")
	}
	reason, err := cleanReason(reason, true)
	if err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	if uuidOrNil(requestID) == nil {
		return lifecycle.DeletionRequest{}, ErrNotFound
	}
	// Recorded first: once the workspace is gone, this entry is what shows who did it and why.
	if err := RecordAudit(ctx, s.db, actor.target("deletion", "deletion.run", requestID, reason, nil, nil)); err != nil {
		return lifecycle.DeletionRequest{}, err
	}
	done, err := s.lifecycle.DeleteWorkspace(ctx, requestID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return lifecycle.DeletionRequest{}, ErrNotFound
	case errors.Is(err, lifecycle.ErrNotDue):
		return lifecycle.DeletionRequest{}, conflict("not_open", "This request isn't scheduled any more.")
	case err != nil:
		return done, &ActionError{Status: http.StatusBadGateway, Code: "deletion_failed", Message: "Deletion failed and will be retried: " + err.Error()}
	}
	return done, nil
}

// ---- Announcements ----

type Announcement struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Severity  string     `json:"severity"`
	Plans     []string   `json:"plans"`
	LinkURL   *string    `json:"linkUrl"`
	LinkLabel *string    `json:"linkLabel"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
	State     string     `json:"state"` // scheduled, live or ended
	CreatedBy *string    `json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`
}

const announcementColumns = `a.id::text, a.title, a.body, a.severity, a.plans, a.link_url, a.link_label, a.starts_at, a.ends_at,
  CASE WHEN a.starts_at > now() THEN 'scheduled' WHEN a.ends_at IS NOT NULL AND a.ends_at <= now() THEN 'ended' ELSE 'live' END,
  u.name, a.created_at`

func scanAnnouncement(row pgx.Row, a *Announcement) error {
	return row.Scan(&a.ID, &a.Title, &a.Body, &a.Severity, &a.Plans, &a.LinkURL, &a.LinkLabel, &a.StartsAt, &a.EndsAt, &a.State, &a.CreatedBy, &a.CreatedAt)
}

func (s *Service) ListAnnouncements(ctx context.Context) ([]Announcement, error) {
	return queryAll(ctx, s, `SELECT `+announcementColumns+` FROM announcements a LEFT JOIN users u ON u.id = a.created_by
ORDER BY (a.ends_at IS NULL OR a.ends_at > now()) DESC, a.starts_at DESC LIMIT 100`, nil,
		func(row pgx.Rows, v *Announcement) error { return scanAnnouncement(row, v) })
}

type AnnouncementInput struct {
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Severity  string     `json:"severity"`
	Plans     []string   `json:"plans"`
	LinkURL   string     `json:"linkUrl"`
	LinkLabel string     `json:"linkLabel"`
	StartsAt  *time.Time `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
}

func (in *AnnouncementInput) clean() error {
	in.Title, in.Body = strings.TrimSpace(in.Title), strings.TrimSpace(in.Body)
	in.LinkURL, in.LinkLabel = strings.TrimSpace(in.LinkURL), strings.TrimSpace(in.LinkLabel)
	switch {
	case in.Title == "" || len(in.Title) > 120:
		return invalid("invalid_title", "Give it a title of up to 120 characters.")
	case len(in.Body) > 600:
		return invalid("invalid_body", "Keep the message under 600 characters.")
	case in.Severity != "info" && in.Severity != "warning" && in.Severity != "critical":
		return invalid("invalid_severity", "Pick info, warning or critical.")
	case in.LinkURL != "" && !strings.HasPrefix(in.LinkURL, "https://") && !strings.HasPrefix(in.LinkURL, "http://"):
		return invalid("invalid_link", "Links must start with https://.")
	case in.StartsAt != nil && in.EndsAt != nil && !in.EndsAt.After(*in.StartsAt):
		return invalid("invalid_dates", "The end must be after the start.")
	}
	if in.Plans == nil {
		in.Plans = []string{}
	}
	for _, plan := range in.Plans {
		if !billing.ValidPlan(plan) {
			return invalid("invalid_plan", "Unknown plan: "+plan)
		}
	}
	if in.LinkURL == "" {
		in.LinkLabel = ""
	}
	return nil
}

// SaveAnnouncement creates an announcement (id empty) or replaces one.
func (s *Service) SaveAnnouncement(ctx context.Context, actor Actor, id string, input AnnouncementInput) (Announcement, error) {
	if err := input.clean(); err != nil {
		return Announcement{}, err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Announcement{}, err
	}
	defer tx.Rollback(ctx)
	action := "announcement.update"
	if id == "" {
		action = "announcement.create"
		err = tx.QueryRow(ctx, `
INSERT INTO announcements (title, body, severity, plans, link_url, link_label, starts_at, ends_at, created_by)
VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), COALESCE($7, now()), $8, $9::uuid) RETURNING id::text`,
			input.Title, input.Body, input.Severity, input.Plans, input.LinkURL, input.LinkLabel, input.StartsAt, input.EndsAt, actor.Admin.UserID).Scan(&id)
	} else {
		if uuidOrNil(id) == nil {
			return Announcement{}, ErrNotFound
		}
		var tag interface{ RowsAffected() int64 }
		tag, err = tx.Exec(ctx, `
UPDATE announcements SET title = $2, body = $3, severity = $4, plans = $5, link_url = NULLIF($6, ''), link_label = NULLIF($7, ''),
  starts_at = COALESCE($8, starts_at), ends_at = $9, updated_at = now() WHERE id = $1::uuid`,
			id, input.Title, input.Body, input.Severity, input.Plans, input.LinkURL, input.LinkLabel, input.StartsAt, input.EndsAt)
		if err == nil && tag.RowsAffected() == 0 {
			return Announcement{}, ErrNotFound
		}
	}
	if err != nil {
		return Announcement{}, err
	}
	if err := RecordAudit(ctx, tx, actor.target("announcement", action, id, "", nil, map[string]any{"title": input.Title, "severity": input.Severity, "plans": input.Plans, "startsAt": input.StartsAt, "endsAt": input.EndsAt})); err != nil {
		return Announcement{}, err
	}
	var a Announcement
	if err := scanAnnouncement(tx.QueryRow(ctx, `SELECT `+announcementColumns+` FROM announcements a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = $1::uuid`, id), &a); err != nil {
		return Announcement{}, err
	}
	return a, tx.Commit(ctx)
}

// EndAnnouncement takes an announcement down now.
func (s *Service) EndAnnouncement(ctx context.Context, actor Actor, id string) error {
	if uuidOrNil(id) == nil {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var title string
	err = tx.QueryRow(ctx, `UPDATE announcements SET ends_at = now(), starts_at = LEAST(starts_at, now() - interval '1 second'), updated_at = now()
WHERE id = $1::uuid AND (ends_at IS NULL OR ends_at > now()) RETURNING title`, id).Scan(&title)
	if errors.Is(err, pgx.ErrNoRows) {
		return conflict("ended", "This announcement has already ended.")
	}
	if err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, actor.target("announcement", "announcement.end", id, "", nil, map[string]string{"title": title})); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
