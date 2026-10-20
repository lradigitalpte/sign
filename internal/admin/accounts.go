package admin

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/identity"
	"signing-platform/internal/lifecycle"
)

// WithDirectory lets admins rename WorkOS organizations. directory may be nil (renames then only work
// for personal workspaces).
func (s *Service) WithDirectory(directory identity.DirectoryAdmin) *Service {
	s.directory = directory
	return s
}

// ---- Rename ----

type RenameResult struct {
	Name           string `json:"name"`
	SyncedToWorkOS bool   `json:"syncedToWorkOS"`
}

// RenameWorkspace renames a workspace so the new name sticks. WorkOS organizations are renamed in WorkOS
// (sign-in copies the name from there); personal workspaces get a locked name that sign-in leaves alone.
func (s *Service) RenameWorkspace(ctx context.Context, actor Actor, workspaceID, name, reason string) (RenameResult, error) {
	name, err := identity.CleanWorkspaceName(name)
	if err != nil {
		return RenameResult{}, invalid("invalid_name", "Use a name of 1 to 100 characters.")
	}
	reason, err = cleanReason(reason, true)
	if err != nil {
		return RenameResult{}, err
	}
	if uuidOrNil(workspaceID) == nil {
		return RenameResult{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return RenameResult{}, err
	}
	defer tx.Rollback(ctx)

	current, workos, err := identity.RenameWorkspace(ctx, tx, s.directory, workspaceID, name)
	var rejected *identity.RenameRejectedError
	switch {
	case errors.Is(err, identity.ErrRenameNotFound):
		return RenameResult{}, ErrNotFound
	case errors.Is(err, identity.ErrNameUnchanged):
		return RenameResult{}, conflict("unchanged", "That's already the name.")
	case errors.Is(err, identity.ErrRenameUnavailable):
		return RenameResult{}, &ActionError{Status: http.StatusServiceUnavailable, Code: "workos_unavailable", Message: "This workspace's name comes from WorkOS, and WorkOS isn't connected here, so it can't be renamed."}
	case errors.As(err, &rejected):
		return RenameResult{}, &ActionError{Status: http.StatusBadGateway, Code: "workos_failed", Message: rejected.Error()}
	case err != nil:
		return RenameResult{}, err
	}
	event := actor.target("workspace", "workspace.rename", workspaceID, reason, map[string]string{"name": current}, map[string]any{"name": name, "syncedToWorkOS": workos})
	if err := RecordAudit(ctx, tx, event); err != nil {
		return RenameResult{}, err
	}
	return RenameResult{Name: name, SyncedToWorkOS: workos}, tx.Commit(ctx)
}

// ---- Account deletions ----

func (s *Service) ListAccountDeletions(ctx context.Context, status string, page Page) (List[lifecycle.AccountDeletionRequest], error) {
	page = page.normalize()
	if !deletionStatuses[status] && status != "open" {
		status = ""
	}
	where := ` WHERE ($1 = '' OR status = $1 OR ($1 = 'open' AND status IN ('scheduled', 'failed')))`
	result := List[lifecycle.AccountDeletionRequest]{Items: []lifecycle.AccountDeletionRequest{}, Page: page.Number, PageSize: page.Size}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM account_deletion_requests`+where, status).Scan(&result.Total); err != nil {
		return result, err
	}
	items, err := queryAll(ctx, s, `
SELECT id::text, user_id::text, user_email, status, scheduled_for, canceled_at, completed_at, error, warning, workspaces_deleted, created_at
FROM account_deletion_requests`+where+`
ORDER BY (status IN ('scheduled', 'failed')) DESC, CASE WHEN status IN ('scheduled', 'failed') THEN scheduled_for END, created_at DESC
LIMIT $2 OFFSET $3`, []any{status, page.Size, page.offset()},
		func(row pgx.Rows, v *lifecycle.AccountDeletionRequest) error {
			r, err := lifecycle.ScanAccountRequest(row)
			*v = r
			return err
		})
	if err != nil {
		return result, err
	}
	result.Items = items
	return result, nil
}

func (s *Service) CancelAccountDeletion(ctx context.Context, actor Actor, requestID, reason string) (lifecycle.AccountDeletionRequest, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return lifecycle.AccountDeletionRequest{}, err
	}
	if uuidOrNil(requestID) == nil {
		return lifecycle.AccountDeletionRequest{}, ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return lifecycle.AccountDeletionRequest{}, err
	}
	defer tx.Rollback(ctx)
	canceled, err := lifecycle.CancelAccountDeletion(ctx, tx, requestID, actor.Admin.UserID)
	if errors.Is(err, lifecycle.ErrNoAccountRequest) {
		return canceled, conflict("not_open", "This request isn't scheduled any more.")
	}
	if err != nil {
		return canceled, err
	}
	if err := RecordAudit(ctx, tx, actor.target("user", "user.deletion_cancel", canceled.UserID, reason, map[string]string{"status": "scheduled"}, map[string]string{"status": "canceled"})); err != nil {
		return canceled, err
	}
	return canceled, tx.Commit(ctx)
}

// RunAccountDeletionNow deletes the account straight away instead of waiting out the grace period.
func (s *Service) RunAccountDeletionNow(ctx context.Context, actor Actor, requestID, reason string) (lifecycle.AccountDeletionRequest, error) {
	if s.lifecycle == nil {
		return lifecycle.AccountDeletionRequest{}, errors.New("lifecycle is not configured for the admin service")
	}
	reason, err := cleanReason(reason, true)
	if err != nil {
		return lifecycle.AccountDeletionRequest{}, err
	}
	if uuidOrNil(requestID) == nil {
		return lifecycle.AccountDeletionRequest{}, ErrNotFound
	}
	var userID string
	err = s.db.QueryRow(ctx, `SELECT user_id::text FROM account_deletion_requests WHERE id = $1::uuid`, requestID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return lifecycle.AccountDeletionRequest{}, ErrNotFound
	}
	if err != nil {
		return lifecycle.AccountDeletionRequest{}, err
	}
	if err := RecordAudit(ctx, s.db, actor.target("user", "user.deletion_run", userID, reason, nil, nil)); err != nil {
		return lifecycle.AccountDeletionRequest{}, err
	}
	done, err := s.lifecycle.DeleteAccount(ctx, requestID)
	switch {
	case errors.Is(err, lifecycle.ErrNotDue):
		return done, conflict("not_open", "This request isn't scheduled any more.")
	case err != nil:
		return done, &ActionError{Status: http.StatusConflict, Code: "deletion_failed", Message: "Deletion failed and will be retried: " + err.Error()}
	}
	return done, nil
}
