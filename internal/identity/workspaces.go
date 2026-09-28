package identity

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
)

// WorkspaceHeader lets the web app choose which of the user's workspaces a request acts on.
// Without it, requests use the workspace implied by the login session (usually the personal one).
const WorkspaceHeader = "X-Workspace-ID"

var ErrWorkspaceNotFound = errors.New("you are not a member of this workspace")

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type WorkspaceStore interface {
	ListWorkspaces(ctx context.Context, userID string) ([]Workspace, error)
	MemberWorkspace(ctx context.Context, userID, workspaceID string) (Workspace, error)
}

// SelectWorkspace switches the session to another workspace the user belongs to.
func (s *Service) SelectWorkspace(ctx context.Context, session Session, workspaceID string) (Session, error) {
	if s.workspaces == nil || !uuidPattern.MatchString(workspaceID) {
		return Session{}, ErrWorkspaceNotFound
	}
	workspace, err := s.workspaces.MemberWorkspace(ctx, session.User.ID, workspaceID)
	if err != nil {
		return Session{}, err
	}
	session.Workspace = workspace
	return session, nil
}

func (s *Service) ListWorkspaces(ctx context.Context, userID string) ([]Workspace, error) {
	if s.workspaces == nil {
		return []Workspace{}, nil
	}
	return s.workspaces.ListWorkspaces(ctx, userID)
}

const workspaceColumns = `o.id::text, o.name, o.slug, m.role::text, o.slug LIKE 'personal-%'`

func (s *PostgresStore) ListWorkspaces(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := s.db.Query(ctx, `
SELECT `+workspaceColumns+`
FROM organization_memberships m
JOIN organizations o ON o.id = m.organization_id
WHERE m.user_id = $1::uuid
ORDER BY (o.slug LIKE 'personal-%') DESC, o.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	defer rows.Close()
	values := []Workspace{}
	for rows.Next() {
		var workspace Workspace
		if err := rows.Scan(&workspace.ID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.Personal); err != nil {
			return nil, err
		}
		values = append(values, workspace)
	}
	return values, rows.Err()
}

func (s *PostgresStore) MemberWorkspace(ctx context.Context, userID, workspaceID string) (Workspace, error) {
	var workspace Workspace
	err := s.db.QueryRow(ctx, `
SELECT `+workspaceColumns+`
FROM organization_memberships m
JOIN organizations o ON o.id = m.organization_id
WHERE m.user_id = $1::uuid AND m.organization_id = $2::uuid`, userID, workspaceID).
		Scan(&workspace.ID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.Personal)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workspace{}, ErrWorkspaceNotFound
	}
	if err != nil {
		return Workspace{}, fmt.Errorf("load workspace: %w", err)
	}
	return workspace, nil
}
