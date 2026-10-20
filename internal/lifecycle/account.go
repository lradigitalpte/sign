package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"signing-platform/internal/identity"
)

// Account deletion: a person asks to delete their own Signet account. Thirty days later their
// workspaces nobody else uses are deleted, they're removed from the others, and their user record is
// anonymized (it can't be removed: envelopes they sent elsewhere still point at it). Their WorkOS
// login is deleted too, so they can't sign back in to the old account.

var (
	ErrAccountScheduled = errors.New("this account is already scheduled for deletion")
	ErrPlatformAdmin    = errors.New("Signet admins can't delete their account; ask another admin to remove your admin access first")
	ErrNoAccountRequest = errors.New("no deletion is scheduled for this account")
)

// SharedWorkspacesError lists workspaces the person owns that others still use.
type SharedWorkspacesError struct{ Names []string }

func (e *SharedWorkspacesError) Error() string {
	return "you own workspaces other people use: " + strings.Join(e.Names, ", ") + ". Remove the other members or delete those workspaces first"
}

// WithDirectory lets account deletion remove the person's WorkOS login.
func (s *Service) WithDirectory(directory identity.DirectoryAdmin) *Service {
	s.directory = directory
	return s
}

type AccountDeletionRequest struct {
	ID                string     `json:"id"`
	UserID            string     `json:"userId"`
	UserEmail         string     `json:"userEmail"`
	Status            string     `json:"status"`
	ScheduledFor      time.Time  `json:"scheduledFor"`
	CanceledAt        *time.Time `json:"canceledAt"`
	CompletedAt       *time.Time `json:"completedAt"`
	Error             *string    `json:"error"`
	Warning           *string    `json:"warning"`
	WorkspacesDeleted *int       `json:"workspacesDeleted"`
	CreatedAt         time.Time  `json:"createdAt"`
}

const accountColumns = `id::text, user_id::text, user_email, status, scheduled_for, canceled_at, completed_at, error, warning, workspaces_deleted, created_at`

func ScanAccountRequest(row pgx.Row) (AccountDeletionRequest, error) {
	var r AccountDeletionRequest
	err := row.Scan(&r.ID, &r.UserID, &r.UserEmail, &r.Status, &r.ScheduledFor, &r.CanceledAt, &r.CompletedAt, &r.Error, &r.Warning, &r.WorkspacesDeleted, &r.CreatedAt)
	return r, err
}

// ownedWorkspaces lists the workspaces the person owns, and which of them other people also use.
func ownedWorkspaces(ctx context.Context, q querier, userID string) (solo []string, shared []string, err error) {
	rows, err := q.Query(ctx, `
SELECT o.id::text, o.name, (SELECT count(*) FROM organization_memberships other WHERE other.organization_id = o.id AND other.user_id <> $1::uuid)
FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
WHERE m.user_id = $1::uuid AND m.role = 'owner' ORDER BY o.name`, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		var others int
		if err := rows.Scan(&id, &name, &others); err != nil {
			return nil, nil, err
		}
		if others > 0 {
			shared = append(shared, name)
		} else {
			solo = append(solo, id)
		}
	}
	return solo, shared, rows.Err()
}

// checkAccountDeletable returns why the account can't be deleted yet, or nil.
func checkAccountDeletable(ctx context.Context, q querier, userID string) error {
	var admin bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = $1::uuid)`, userID).Scan(&admin); err != nil {
		return err
	}
	if admin {
		return ErrPlatformAdmin
	}
	solo, shared, err := ownedWorkspaces(ctx, q, userID)
	if err != nil {
		return err
	}
	if len(shared) > 0 {
		return &SharedWorkspacesError{Names: shared}
	}
	for _, orgID := range solo {
		hold, err := LegalHold(ctx, q, orgID)
		if err != nil {
			return err
		}
		if hold {
			return ErrLegalHold
		}
	}
	return nil
}

// RequestAccountDeletion schedules the person's account for deletion after the grace period.
func (s *Service) RequestAccountDeletion(ctx context.Context, userID, email string) (AccountDeletionRequest, error) {
	if err := checkAccountDeletable(ctx, s.db, userID); err != nil {
		return AccountDeletionRequest{}, err
	}
	request, err := ScanAccountRequest(s.db.QueryRow(ctx, `
INSERT INTO account_deletion_requests (user_id, user_email, scheduled_for) VALUES ($1::uuid, $2, now() + make_interval(secs => $3))
RETURNING `+accountColumns, userID, email, DeletionGrace.Seconds()))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return AccountDeletionRequest{}, ErrAccountScheduled
	}
	return request, err
}

// PendingAccountDeletion returns the person's open request, if any.
func PendingAccountDeletion(ctx context.Context, q querier, userID string) (*AccountDeletionRequest, error) {
	request, err := ScanAccountRequest(q.QueryRow(ctx, `SELECT `+accountColumns+` FROM account_deletion_requests WHERE user_id = $1::uuid AND status IN ('scheduled', 'failed')`, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &request, nil
}

// CancelAccountDeletion keeps the account. canceledBy is the person or the admin who canceled.
func CancelAccountDeletion(ctx context.Context, q querier, requestID, canceledBy string) (AccountDeletionRequest, error) {
	request, err := ScanAccountRequest(q.QueryRow(ctx, `
UPDATE account_deletion_requests SET status = 'canceled', canceled_at = now(), canceled_by = $2::uuid, updated_at = now()
WHERE id = $1::uuid AND status IN ('scheduled', 'failed') RETURNING `+accountColumns, requestID, canceledBy))
	if errors.Is(err, pgx.ErrNoRows) {
		return AccountDeletionRequest{}, ErrNoAccountRequest
	}
	return request, err
}

// RunDueAccountDeletions carries out account requests whose grace period is over. Failed ones are retried hourly.
func (s *Service) RunDueAccountDeletions(ctx context.Context) (int, error) {
	ids, err := textColumn(ctx, s.db, `
SELECT id::text FROM account_deletion_requests
WHERE scheduled_for <= now() AND (status = 'scheduled' OR (status = 'failed' AND updated_at < now() - interval '1 hour'))
ORDER BY scheduled_for LIMIT 5`)
	if err != nil {
		return 0, err
	}
	done := 0
	for _, id := range ids {
		if _, err := s.DeleteAccount(ctx, id); err != nil {
			s.logger.Error("lifecycle: delete account", "requestId", id, "error", err)
			continue
		}
		done++
	}
	return done, nil
}

// DeleteAccount carries out one account deletion now, whatever its date.
func (s *Service) DeleteAccount(ctx context.Context, requestID string) (AccountDeletionRequest, error) {
	request, err := ScanAccountRequest(s.db.QueryRow(ctx, `SELECT `+accountColumns+` FROM account_deletion_requests WHERE id = $1::uuid`, requestID))
	if err != nil {
		return AccountDeletionRequest{}, err
	}
	if request.Status != "scheduled" && request.Status != "failed" {
		return request, ErrNotDue
	}
	fail := func(cause error) (AccountDeletionRequest, error) {
		_, _ = s.db.Exec(ctx, `UPDATE account_deletion_requests SET status = 'failed', error = $2, updated_at = now() WHERE id = $1::uuid`, requestID, cause.Error())
		return request, cause
	}
	// Checked again: someone may have joined one of their workspaces during the grace period.
	if err := checkAccountDeletable(ctx, s.db, request.UserID); err != nil {
		return fail(err)
	}
	solo, _, err := ownedWorkspaces(ctx, s.db, request.UserID)
	if err != nil {
		return fail(err)
	}
	// Each workspace is deleted in its own transaction, so a storage failure halfway keeps the ones
	// not yet deleted intact; the retry picks up where this left off.
	for _, orgID := range solo {
		if err := s.purgeWorkspaceNow(ctx, orgID); err != nil {
			return fail(fmt.Errorf("delete workspace: %w", err))
		}
	}
	subjects, err := textColumn(ctx, s.db, `SELECT provider_subject FROM auth_identities WHERE user_id = $1::uuid AND provider = 'workos'`, request.UserID)
	if err != nil {
		return fail(err)
	}
	if err := anonymizeUser(ctx, s, request.UserID); err != nil {
		return fail(err)
	}
	// The account is gone from Signet now; failing to remove the WorkOS login only means they could
	// sign up again with the same email (as a new, empty account), so it's a warning, not a failure.
	var warnings []string
	for _, subject := range subjects {
		if s.directory == nil {
			warnings = append(warnings, "WorkOS login not removed: not configured")
			break
		}
		if err := s.directory.DeleteUser(ctx, subject); err != nil {
			warnings = append(warnings, "WorkOS login not removed: "+err.Error())
		}
	}
	var warning *string
	if len(warnings) > 0 {
		text := strings.Join(warnings, "; ")
		warning = &text
	}
	return ScanAccountRequest(s.db.QueryRow(ctx, `
UPDATE account_deletion_requests SET status = 'completed', completed_at = now(), error = NULL, warning = $2, workspaces_deleted = $3, updated_at = now()
WHERE id = $1::uuid RETURNING `+accountColumns, requestID, warning, len(solo)))
}

// purgeWorkspaceNow deletes one workspace's files and rows in its own transaction.
func (s *Service) purgeWorkspaceNow(ctx context.Context, orgID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, _, err := s.purgeWorkspace(ctx, tx, orgID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.objects.Invalidate(orgID)
	return nil
}

// anonymizeUser removes everything personal about a user, keeping the row other records point at.
func anonymizeUser(ctx context.Context, s *Service, userID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, sql := range []string{
		`DELETE FROM organization_memberships WHERE user_id = $1::uuid`,
		`DELETE FROM team_memberships WHERE user_id = $1::uuid`,
		`DELETE FROM member_group_members WHERE user_id = $1::uuid`,
		`DELETE FROM user_signature_preferences WHERE user_id = $1::uuid`,
		`DELETE FROM auth_identities WHERE user_id = $1::uuid`,
		// Envelopes sent to them stay with their senders; only the link to this account goes.
		`UPDATE recipients SET user_id = NULL WHERE user_id = $1::uuid`,
		`UPDATE users SET email = 'deleted+' || id::text || '@deleted.invalid', name = 'Deleted user', avatar_data_url = NULL,
		   email_verified_at = NULL, suspended_at = NULL, suspended_reason = NULL, deleted_at = now(), updated_at = now()
		 WHERE id = $1::uuid`,
	} {
		if _, err := tx.Exec(ctx, sql, userID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
