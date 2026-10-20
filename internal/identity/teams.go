package identity

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// TeamHeader lets the web app choose which team in the workspace a request acts on. Without it,
// requests use the workspace's default team.
const TeamHeader = "X-Team-ID"

var ErrTeamNotFound = errors.New("you don't have access to this team")

// Team is the team a request works in. Envelopes, templates and folders belong to teams.
type Team struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsDefault bool   `json:"isDefault"`
	// Role is the user's role on the team (directly or through a member group), or empty when they have
	// access through the default team or as a workspace owner or admin.
	Role string `json:"role,omitempty"`
}

type TeamStore interface {
	// ResolveTeam returns the team, or the workspace's default team when teamID is empty, if the user can use it.
	ResolveTeam(ctx context.Context, userID, workspaceID, workspaceRole, teamID string) (Team, error)
}

// CanManageAllTeams: workspace owners and admins see and manage every team.
func CanManageAllTeams(workspaceRole string) bool {
	return workspaceRole == "owner" || workspaceRole == "admin"
}

// TeamAccessSQL is true when user $1 with workspace role $2 can use team t: the default team is open to
// every workspace member, workspace owners and admins can use any team, and everyone else needs to be on
// it, directly or through a member group attached to it (team_role, migration 000034).
const TeamAccessSQL = `(t.is_default OR $2 IN ('owner', 'admin') OR team_role(t.id, $1::uuid) IS NOT NULL)`

// SelectTeam sets the session's team: the requested one, or the workspace's default team.
func (s *Service) SelectTeam(ctx context.Context, session Session, teamID string) (Session, error) {
	if s.teams == nil {
		return session, nil
	}
	if teamID != "" && !uuidPattern.MatchString(teamID) {
		return Session{}, ErrTeamNotFound
	}
	team, err := s.teams.ResolveTeam(ctx, session.User.ID, session.Workspace.ID, session.Workspace.Role, teamID)
	if err != nil {
		return Session{}, err
	}
	session.Team = team
	return session, nil
}

func (s *PostgresStore) ResolveTeam(ctx context.Context, userID, workspaceID, workspaceRole, teamID string) (Team, error) {
	var team Team
	err := s.db.QueryRow(ctx, `
SELECT t.id::text, t.name, t.is_default,
       COALESCE(team_role(t.id, $1::uuid), '')
FROM teams t
WHERE t.organization_id = $3::uuid
  AND (($4 = '' AND t.is_default) OR t.id::text = $4)
  AND `+TeamAccessSQL, userID, workspaceRole, workspaceID, teamID).
		Scan(&team.ID, &team.Name, &team.IsDefault, &team.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		if teamID == "" {
			// Every workspace gets a default team when it's created; without one there's nothing to select.
			return Team{}, nil
		}
		return Team{}, ErrTeamNotFound
	}
	if err != nil {
		return Team{}, fmt.Errorf("resolve team: %w", err)
	}
	return team, nil
}
