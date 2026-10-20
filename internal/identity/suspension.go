package identity

import (
	"context"
	"net/http"
)

// Error codes the web app turns into a "suspended" screen.
const (
	CodeAccountSuspended   = "account_suspended"
	CodeWorkspaceSuspended = "workspace_suspended"
)

// Suspension says whether Signet staff have suspended the user or the workspace a request acts on.
type Suspension struct {
	User      bool
	Workspace bool
}

type suspensionStore interface {
	Suspension(ctx context.Context, userID, workspaceID string) (Suspension, error)
}

// Suspension reports nothing when the store can't tell (test fakes), so it never blocks by mistake.
func (s *Service) Suspension(ctx context.Context, session Session) (Suspension, error) {
	store, ok := s.store.(suspensionStore)
	if !ok {
		return Suspension{}, nil
	}
	return store.Suspension(ctx, session.User.ID, session.Workspace.ID)
}

func (s *PostgresStore) Suspension(ctx context.Context, userID, workspaceID string) (Suspension, error) {
	var value Suspension
	err := s.db.QueryRow(ctx, `
SELECT
  EXISTS (SELECT 1 FROM users WHERE id = $1::uuid AND suspended_at IS NOT NULL),
  EXISTS (SELECT 1 FROM organizations WHERE id = $2::uuid AND suspended_at IS NOT NULL)`, userID, workspaceID).Scan(&value.User, &value.Workspace)
	return value, err
}

// allowedInSuspendedWorkspace lets members of a suspended workspace still load their profile and
// workspace list, so the web app can show what happened and offer their other workspaces.
func allowedInSuspendedWorkspace(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	switch r.URL.Path {
	case "/v1/me", "/v1/workspaces", "/v1/workspaces/":
		return true
	}
	return false
}
