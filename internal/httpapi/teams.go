package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/identity"
)

// Teams own envelopes, templates and folders. Every workspace has a default team open to all its members;
// other teams are open to workspace owners and admins and to the people on them (identity.TeamAccessSQL).
type teamAccess struct{ db *pgxpool.Pool }

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// inCurrentTeam keeps the envelope IDs that belong to the request's team, so bulk actions only touch
// what the user is looking at.
func (t *teamAccess) inCurrentTeam(ctx context.Context, session identity.Session, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return ids, nil
	}
	rows, err := t.db.Query(ctx, `SELECT id::text FROM envelopes WHERE organization_id = $1::uuid AND team_id::text = $2 AND id = ANY($3::uuid[])`, session.Workspace.ID, session.Team.ID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	kept := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		kept = append(kept, id)
	}
	return kept, rows.Err()
}

// envelopeAccess answers 404 for envelopes in a team the user can't use, as if they didn't exist. Envelopes
// in other teams the user can use are allowed, so links keep working whichever team is selected.
func (t *teamAccess) envelopeAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		var allowed bool
		err := t.db.QueryRow(r.Context(), `
SELECT `+identity.TeamAccessSQL+`
FROM envelopes e JOIN teams t ON t.id = e.team_id
WHERE e.id::text = $3 AND e.organization_id = $4::uuid`, session.User.ID, session.Workspace.Role, chi.URLParam(r, "envelopeID"), session.Workspace.ID).Scan(&allowed)
		if errors.Is(err, pgx.ErrNoRows) {
			// Unknown envelope: the handler answers 404 itself.
			next.ServeHTTP(w, r)
			return
		}
		if err != nil {
			slog.Error("check envelope team access", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load envelope"})
			return
		}
		if !allowed {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "envelope not found"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

type teamSummary struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	IsDefault     bool      `json:"isDefault"`
	MemberCount   int       `json:"memberCount"`
	EnvelopeCount int       `json:"envelopeCount"`
	Role          string    `json:"role"`      // the user's team role, or empty
	CanManage     bool      `json:"canManage"` // rename the team and choose who's on it
	CreatedAt     time.Time `json:"createdAt"`
}

type teamMember struct {
	UserID  string    `json:"userId"`
	Name    string    `json:"name"`
	Email   string    `json:"email"`
	Role    string    `json:"role"`
	AddedAt time.Time `json:"addedAt"`
}

var teamRoles = map[string]bool{"admin": true, "member": true}

// MemberCount is everyone with access: people added directly plus members of attached groups.
const teamSummaryColumns = `t.id::text, t.name, t.slug, t.is_default,
  CASE WHEN t.is_default THEN (SELECT count(*) FROM organization_memberships m WHERE m.organization_id = t.organization_id)
       ELSE (SELECT count(*) FROM (
         SELECT tm.user_id FROM team_memberships tm WHERE tm.team_id = t.id
         UNION SELECT gm.user_id FROM team_groups tg JOIN member_group_members gm ON gm.group_id = tg.group_id WHERE tg.team_id = t.id
       ) people) END,
  (SELECT count(*) FROM envelopes e WHERE e.team_id = t.id),
  COALESCE(team_role(t.id, $1::uuid), ''),
  t.created_at`

func scanTeam(row pgx.Row, workspaceRole string) (teamSummary, error) {
	var team teamSummary
	err := row.Scan(&team.ID, &team.Name, &team.Slug, &team.IsDefault, &team.MemberCount, &team.EnvelopeCount, &team.Role, &team.CreatedAt)
	team.CanManage = identity.CanManageAllTeams(workspaceRole) || team.Role == "owner" || team.Role == "admin"
	return team, err
}

// loadTeam returns a team of the session's workspace that the user can use.
func (t *teamAccess) loadTeam(ctx context.Context, session identity.Session, teamID string) (teamSummary, error) {
	return scanTeam(t.db.QueryRow(ctx, `SELECT `+teamSummaryColumns+` FROM teams t
WHERE t.id::text = $3 AND t.organization_id = $4::uuid AND `+identity.TeamAccessSQL, session.User.ID, session.Workspace.Role, teamID, session.Workspace.ID), session.Workspace.Role)
}

func teamSlug(name string) string {
	slug := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if slug == "" {
		slug = "team"
	}
	return slug
}

func cleanTeamName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	return name, name != "" && len([]rune(name)) <= 60
}

// routes mounts /v1/teams.
func (t *teamAccess) routes(r chi.Router) {
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		s, _ := identity.SessionFromContext(req.Context())
		rows, err := t.db.Query(req.Context(), `SELECT `+teamSummaryColumns+` FROM teams t
WHERE t.organization_id = $3::uuid AND `+identity.TeamAccessSQL+`
ORDER BY t.is_default DESC, lower(t.name)`, s.User.ID, s.Workspace.Role, s.Workspace.ID)
		if err != nil {
			slog.Error("list teams", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list teams"})
			return
		}
		defer rows.Close()
		data := []teamSummary{}
		for rows.Next() {
			team, err := scanTeam(rows, s.Workspace.Role)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list teams"})
				return
			}
			data = append(data, team)
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": data, "canCreate": identity.CanManageAllTeams(s.Workspace.Role)})
	})

	r.Post("/", func(w http.ResponseWriter, req *http.Request) {
		s, _ := identity.SessionFromContext(req.Context())
		if !identity.CanManageAllTeams(s.Workspace.Role) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only workspace owners and admins can create teams."})
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, req.Body, 4<<10)).Decode(&in) != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		name, ok := cleanTeamName(in.Name)
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Use a team name of 1 to 60 characters."})
			return
		}
		// The creator joins as the team's admin.
		var id string
		err := t.db.QueryRow(req.Context(), `
WITH created AS (INSERT INTO teams (organization_id, name, slug, created_by) VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING id)
INSERT INTO team_memberships (team_id, user_id, role) SELECT id, $4::uuid, 'admin' FROM created RETURNING team_id::text`,
			s.Workspace.ID, name, teamSlug(name), s.User.ID).Scan(&id)
		if err != nil {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "A team with this name already exists."})
			return
		}
		team, err := t.loadTeam(req.Context(), s, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load the new team"})
			return
		}
		writeJSON(w, http.StatusCreated, team)
	})

	r.Route("/{teamID}", func(item chi.Router) {
		// Every route below works on a team the user can use; others answer 404.
		item.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				team, err := t.loadTeam(req.Context(), s, chi.URLParam(req, "teamID"))
				if errors.Is(err, pgx.ErrNoRows) || (err != nil && strings.Contains(err.Error(), "invalid input syntax")) {
					writeJSON(w, http.StatusNotFound, map[string]string{"error": "team not found"})
					return
				}
				if err != nil {
					slog.Error("load team", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load team"})
					return
				}
				next.ServeHTTP(w, req.WithContext(context.WithValue(req.Context(), teamContextKey{}, team)))
			})
		})

		item.Get("/", func(w http.ResponseWriter, req *http.Request) {
			writeJSON(w, http.StatusOK, teamFrom(req))
		})

		item.Patch("/", func(w http.ResponseWriter, req *http.Request) {
			team := teamFrom(req)
			if !team.CanManage {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only team admins and workspace admins can rename this team."})
				return
			}
			var in struct {
				Name string `json:"name"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 4<<10)).Decode(&in) != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			name, ok := cleanTeamName(in.Name)
			if !ok {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Use a team name of 1 to 60 characters."})
				return
			}
			if _, err := t.db.Exec(req.Context(), `UPDATE teams SET name = $2, slug = $3, updated_at = now() WHERE id = $1::uuid`, team.ID, name, teamSlug(name)); err != nil {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "A team with this name already exists."})
				return
			}
			team.Name, team.Slug = name, teamSlug(name)
			writeJSON(w, http.StatusOK, team)
		})

		item.Delete("/", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			team := teamFrom(req)
			switch {
			case !identity.CanManageAllTeams(s.Workspace.Role):
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only workspace owners and admins can delete teams."})
			case team.IsDefault:
				writeJSON(w, http.StatusConflict, map[string]string{"error": "The default team can't be deleted."})
			case team.EnvelopeCount > 0:
				writeJSON(w, http.StatusConflict, map[string]string{"error": "This team still has envelopes or templates. Move or delete them first."})
			default:
				if _, err := t.db.Exec(req.Context(), `DELETE FROM teams WHERE id = $1::uuid AND NOT is_default AND NOT EXISTS (SELECT 1 FROM envelopes WHERE team_id = $1::uuid)`, team.ID); err != nil {
					slog.Error("delete team", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete the team"})
					return
				}
				w.WriteHeader(http.StatusNoContent)
			}
		})

		item.Get("/members", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			team := teamFrom(req)
			// Everyone in the workspace is on the default team.
			// People added directly; members of attached groups are listed under /groups.
			query := `SELECT u.id::text, u.name, u.email, tm.role::text, tm.created_at FROM team_memberships tm JOIN users u ON u.id = tm.user_id
WHERE tm.team_id = $1::uuid ORDER BY tm.role, lower(u.name), u.email`
			arg := team.ID
			if team.IsDefault {
				query = `SELECT u.id::text, u.name, u.email, m.role::text, m.created_at FROM organization_memberships m JOIN users u ON u.id = m.user_id
WHERE m.organization_id = $1::uuid ORDER BY m.role, lower(u.name), u.email`
				arg = s.Workspace.ID
			}
			rows, err := t.db.Query(req.Context(), query, arg)
			if err != nil {
				slog.Error("list team members", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list team members"})
				return
			}
			defer rows.Close()
			members := []teamMember{}
			for rows.Next() {
				var m teamMember
				if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role, &m.AddedAt); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list team members"})
					return
				}
				members = append(members, m)
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": members, "everyone": team.IsDefault})
		})

		// Adding, changing and removing members; not on the default team, which everyone is on.
		manageMembers := func(handler func(w http.ResponseWriter, req *http.Request, s identity.Session, team teamSummary)) http.HandlerFunc {
			return func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				team := teamFrom(req)
				if team.IsDefault {
					writeJSON(w, http.StatusConflict, map[string]string{"error": "Everyone in the workspace is on the default team."})
					return
				}
				if !team.CanManage {
					writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only team admins and workspace admins can change who's on this team."})
					return
				}
				handler(w, req, s, team)
			}
		}

		item.Put("/members/{userID}", manageMembers(func(w http.ResponseWriter, req *http.Request, s identity.Session, team teamSummary) {
			var in struct {
				Role string `json:"role"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 4<<10)).Decode(&in) != nil || !teamRoles[in.Role] {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Choose admin or member."})
				return
			}
			tag, err := t.db.Exec(req.Context(), `
INSERT INTO team_memberships (team_id, user_id, role)
SELECT $1::uuid, m.user_id, $3::membership_role FROM organization_memberships m WHERE m.organization_id = $4::uuid AND m.user_id::text = $2
ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`, team.ID, chi.URLParam(req, "userID"), in.Role, s.Workspace.ID)
			if err != nil {
				slog.Error("set team member", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the team"})
				return
			}
			if tag.RowsAffected() == 0 {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "That person isn't a member of this workspace."})
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}))

		item.Delete("/members/{userID}", manageMembers(func(w http.ResponseWriter, req *http.Request, _ identity.Session, team teamSummary) {
			if _, err := t.db.Exec(req.Context(), `DELETE FROM team_memberships WHERE team_id = $1::uuid AND user_id::text = $2`, team.ID, chi.URLParam(req, "userID")); err != nil {
				slog.Error("remove team member", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the team"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		}))

		// Member groups with access: everyone in an attached group can use the team, with the group's role.
		item.Get("/groups", func(w http.ResponseWriter, req *http.Request) {
			team := teamFrom(req)
			rows, err := t.db.Query(req.Context(), `
SELECT g.id::text, g.name, tg.role::text, (SELECT count(*) FROM member_group_members gm WHERE gm.group_id = g.id), tg.created_at
FROM team_groups tg JOIN member_groups g ON g.id = tg.group_id
WHERE tg.team_id = $1::uuid ORDER BY lower(g.name)`, team.ID)
			if err != nil {
				slog.Error("list team groups", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list the team's groups"})
				return
			}
			defer rows.Close()
			groups := []teamGroup{}
			for rows.Next() {
				var g teamGroup
				if err := rows.Scan(&g.ID, &g.Name, &g.Role, &g.MemberCount, &g.AddedAt); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list the team's groups"})
					return
				}
				groups = append(groups, g)
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": groups})
		})

		item.Put("/groups/{groupID}", manageMembers(func(w http.ResponseWriter, req *http.Request, s identity.Session, team teamSummary) {
			var in struct {
				Role string `json:"role"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 4<<10)).Decode(&in) != nil || !teamRoles[in.Role] {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Choose admin or member."})
				return
			}
			// Only groups of this workspace.
			tag, err := t.db.Exec(req.Context(), `
INSERT INTO team_groups (team_id, group_id, role)
SELECT $1::uuid, g.id, $3::membership_role FROM member_groups g WHERE g.id::text = $2 AND g.organization_id = $4::uuid
ON CONFLICT (team_id, group_id) DO UPDATE SET role = EXCLUDED.role`, team.ID, chi.URLParam(req, "groupID"), in.Role, s.Workspace.ID)
			if err != nil {
				slog.Error("attach group to team", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the team"})
				return
			}
			if tag.RowsAffected() == 0 {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "That group isn't in this workspace."})
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}))

		item.Delete("/groups/{groupID}", manageMembers(func(w http.ResponseWriter, req *http.Request, _ identity.Session, team teamSummary) {
			if _, err := t.db.Exec(req.Context(), `DELETE FROM team_groups WHERE team_id = $1::uuid AND group_id::text = $2`, team.ID, chi.URLParam(req, "groupID")); err != nil {
				slog.Error("detach group from team", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the team"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		}))
	})
}

type teamGroup struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Role        string    `json:"role"`
	MemberCount int       `json:"memberCount"`
	AddedAt     time.Time `json:"addedAt"`
}

type teamContextKey struct{}

func teamFrom(req *http.Request) teamSummary {
	team, _ := req.Context().Value(teamContextKey{}).(teamSummary)
	return team
}
