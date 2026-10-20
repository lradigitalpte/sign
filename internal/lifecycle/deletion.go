package lifecycle

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type DeletionRequest struct {
	ID               string     `json:"id"`
	OrganizationID   *string    `json:"organizationId"`
	OrganizationName string     `json:"organizationName"`
	RequestedByEmail string     `json:"requestedByEmail"`
	Status           string     `json:"status"`
	ScheduledFor     time.Time  `json:"scheduledFor"`
	CanceledAt       *time.Time `json:"canceledAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	Error            *string    `json:"error"`
	EnvelopesDeleted *int       `json:"envelopesDeleted"`
	FilesDeleted     *int       `json:"filesDeleted"`
	CreatedAt        time.Time  `json:"createdAt"`
}

const requestColumns = `id::text, organization_id::text, organization_name, requested_by_email, status, scheduled_for, canceled_at, completed_at, error, envelopes_deleted, files_deleted, created_at`

func ScanRequest(row pgx.Row) (DeletionRequest, error) {
	var r DeletionRequest
	err := row.Scan(&r.ID, &r.OrganizationID, &r.OrganizationName, &r.RequestedByEmail, &r.Status, &r.ScheduledFor, &r.CanceledAt, &r.CompletedAt, &r.Error, &r.EnvelopesDeleted, &r.FilesDeleted, &r.CreatedAt)
	return r, err
}

// LegalHold reports whether the workspace turned on legal hold, which blocks every kind of deletion.
func LegalHold(ctx context.Context, q querier, organizationID string) (bool, error) {
	var hold bool
	err := q.QueryRow(ctx, `
SELECT COALESCE((config->>'legalHold')::boolean, false) FROM organization_settings
WHERE organization_id = $1::uuid AND section = 'retention'`, organizationID).Scan(&hold)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return hold, err
}

// RequestDeletion schedules the workspace for deletion after the grace period. Owners only; the caller checks.
func (s *Service) RequestDeletion(ctx context.Context, organizationID, userID, email string) (DeletionRequest, error) {
	hold, err := LegalHold(ctx, s.db, organizationID)
	if err != nil {
		return DeletionRequest{}, err
	}
	if hold {
		return DeletionRequest{}, ErrLegalHold
	}
	request, err := ScanRequest(s.db.QueryRow(ctx, `
INSERT INTO workspace_deletion_requests (organization_id, organization_name, requested_by, requested_by_email, scheduled_for)
SELECT o.id, o.name, $2::uuid, $3, now() + make_interval(secs => $4) FROM organizations o WHERE o.id = $1::uuid
RETURNING `+requestColumns, organizationID, userID, email, DeletionGrace.Seconds()))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return DeletionRequest{}, ErrAlreadyScheduled
	}
	return request, err
}

// PendingDeletion returns the workspace's open request, if any.
func PendingDeletion(ctx context.Context, q querier, organizationID string) (*DeletionRequest, error) {
	request, err := ScanRequest(q.QueryRow(ctx, `SELECT `+requestColumns+` FROM workspace_deletion_requests WHERE organization_id = $1::uuid AND status IN ('scheduled', 'failed')`, organizationID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

// CancelDeletion keeps the workspace. canceledBy is the customer or the admin who canceled it.
func CancelDeletion(ctx context.Context, q querier, requestID, canceledBy string) (DeletionRequest, error) {
	request, err := ScanRequest(q.QueryRow(ctx, `
UPDATE workspace_deletion_requests SET status = 'canceled', canceled_at = now(), canceled_by = $2::uuid, updated_at = now()
WHERE id = $1::uuid AND status IN ('scheduled', 'failed') RETURNING `+requestColumns, requestID, canceledBy))
	if errors.Is(err, pgx.ErrNoRows) {
		return DeletionRequest{}, ErrNoRequest
	}
	return request, err
}

// RunDueDeletions carries out requests whose grace period is over. Failed ones are retried hourly.
func (s *Service) RunDueDeletions(ctx context.Context) (int, error) {
	ids, err := textColumn(ctx, s.db, `
SELECT id::text FROM workspace_deletion_requests
WHERE scheduled_for <= now() AND (status = 'scheduled' OR (status = 'failed' AND updated_at < now() - interval '1 hour'))
ORDER BY scheduled_for LIMIT 5`)
	if err != nil {
		return 0, err
	}
	done := 0
	for _, id := range ids {
		if _, err := s.DeleteWorkspace(ctx, id); err != nil {
			s.logger.Error("lifecycle: delete workspace", "requestId", id, "error", err)
			continue
		}
		done++
	}
	return done, nil
}

// DeleteWorkspace carries out one deletion request now, whatever its date (admins use this to expedite).
func (s *Service) DeleteWorkspace(ctx context.Context, requestID string) (DeletionRequest, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return DeletionRequest{}, err
	}
	defer tx.Rollback(ctx)

	// NOWAIT: if another run holds the request, leave it to that run.
	request, err := ScanRequest(tx.QueryRow(ctx, `SELECT `+requestColumns+` FROM workspace_deletion_requests WHERE id = $1::uuid FOR UPDATE NOWAIT`, requestID))
	if err != nil {
		return DeletionRequest{}, err
	}
	if (request.Status != "scheduled" && request.Status != "failed") || request.OrganizationID == nil {
		return request, ErrNotDue
	}
	orgID := *request.OrganizationID

	fail := func(cause error) (DeletionRequest, error) {
		_ = tx.Rollback(ctx)
		_, _ = s.db.Exec(ctx, `UPDATE workspace_deletion_requests SET status = 'failed', error = $2, updated_at = now() WHERE id = $1::uuid`, requestID, cause.Error())
		return request, cause
	}
	if hold, err := LegalHold(ctx, tx, orgID); err != nil {
		return fail(err)
	} else if hold {
		return fail(ErrLegalHold)
	}
	envelopes, files, err := s.purgeWorkspace(ctx, tx, orgID)
	if err != nil {
		return fail(err)
	}
	request, err = ScanRequest(tx.QueryRow(ctx, `
UPDATE workspace_deletion_requests SET status = 'completed', completed_at = now(), error = NULL, envelopes_deleted = $2, files_deleted = $3, updated_at = now()
WHERE id = $1::uuid RETURNING `+requestColumns, requestID, envelopes, files))
	if err != nil {
		return fail(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fail(err)
	}
	s.objects.Invalidate(orgID)
	return request, nil
}

// purgeWorkspace deletes a workspace's files, then its rows, inside tx. Open deletion requests for it are
// closed first, because once the workspace row is gone they no longer say which workspace they were for.
func (s *Service) purgeWorkspace(ctx context.Context, tx pgx.Tx, orgID string) (envelopes, files int, err error) {
	keys, err := workspaceKeys(ctx, tx, orgID)
	if err != nil {
		return 0, 0, err
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM envelopes WHERE organization_id = $1::uuid`, orgID).Scan(&envelopes); err != nil {
		return 0, 0, err
	}
	if files, err = s.deleteObjects(ctx, orgID, keys); err != nil {
		return 0, files, err
	}
	if _, err := tx.Exec(ctx, `
UPDATE workspace_deletion_requests SET status = 'completed', completed_at = now(), error = NULL, envelopes_deleted = $2, files_deleted = $3, updated_at = now()
WHERE organization_id = $1::uuid AND status IN ('scheduled', 'failed')`, orgID, envelopes, files); err != nil {
		return 0, files, err
	}
	// Every row that belongs to the workspace cascades from here; request rows keep its name for the record.
	if _, err := tx.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID); err != nil {
		return 0, files, err
	}
	return envelopes, files, nil
}
