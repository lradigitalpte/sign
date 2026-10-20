package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

var (
	ErrRenameNotFound = errors.New("workspace not found")
	ErrNameUnchanged  = errors.New("that's already the name")
	ErrInvalidName    = errors.New("use a name of 1 to 100 characters")
	// ErrRenameUnavailable: the name comes from WorkOS and WorkOS isn't connected, so it can't change.
	ErrRenameUnavailable = errors.New("this workspace's name comes from WorkOS, and WorkOS isn't connected here, so it can't be renamed")
)

// RenameRejectedError is WorkOS refusing the new name; nothing was changed.
type RenameRejectedError struct{ Err error }

func (e *RenameRejectedError) Error() string {
	return "WorkOS didn't accept the new name: " + e.Err.Error()
}
func (e *RenameRejectedError) Unwrap() error { return e.Err }

// CleanWorkspaceName trims a new workspace name and checks its length.
func CleanWorkspaceName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 100 {
		return "", ErrInvalidName
	}
	return name, nil
}

// RenameWorkspace renames a workspace inside tx so the new name sticks. WorkOS organizations are renamed
// in WorkOS first (sign-in copies the name from there, and if WorkOS refuses nothing changes); personal
// workspaces get a locked name that sign-in leaves alone. It returns the previous name and whether
// WorkOS was updated. directory may be nil, in which case only personal workspaces can be renamed.
func RenameWorkspace(ctx context.Context, tx pgx.Tx, directory DirectoryAdmin, workspaceID, name string) (previous string, syncedToWorkOS bool, err error) {
	name, err = CleanWorkspaceName(name)
	if err != nil {
		return "", false, err
	}
	var subject *string
	err = tx.QueryRow(ctx, `
SELECT o.name, (SELECT i.provider_subject FROM organization_auth_identities i WHERE i.organization_id = o.id AND i.provider = 'workos' LIMIT 1)
FROM organizations o WHERE o.id = $1::uuid FOR UPDATE OF o`, workspaceID).Scan(&previous, &subject)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, ErrRenameNotFound
	}
	if err != nil {
		return "", false, err
	}
	if previous == name {
		return previous, false, ErrNameUnchanged
	}
	if subject != nil && !IsPersonalSubject(*subject) {
		if directory == nil {
			return previous, false, ErrRenameUnavailable
		}
		if err := directory.RenameOrganization(ctx, *subject, name); err != nil {
			return previous, false, &RenameRejectedError{Err: err}
		}
		_, err = tx.Exec(ctx, `UPDATE organizations SET name = $2, updated_at = now() WHERE id = $1::uuid`, workspaceID, name)
		if err != nil {
			return previous, true, fmt.Errorf("save renamed workspace: %w", err)
		}
		return previous, true, nil
	}
	_, err = tx.Exec(ctx, `UPDATE organizations SET name = $2, name_locked_at = now(), updated_at = now() WHERE id = $1::uuid`, workspaceID, name)
	return previous, false, err
}

// SyncsNameToWorkOS reports whether renaming the workspace also renames its WorkOS organization.
func SyncsNameToWorkOS(ctx context.Context, db interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}, workspaceID string) (bool, error) {
	var subject *string
	err := db.QueryRow(ctx, `SELECT provider_subject FROM organization_auth_identities WHERE organization_id = $1::uuid AND provider = 'workos' LIMIT 1`, workspaceID).Scan(&subject)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return subject != nil && !IsPersonalSubject(*subject), err
}
