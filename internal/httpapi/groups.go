package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/identity"
)

// Member groups are named sets of workspace members. Attaching a group to a team (teams.go) gives everyone in
// it access to that team. Workspace owners and admins manage groups; everyone can see them.

type groupTeam struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type memberGroup struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	MemberCount int         `json:"memberCount"`
	Teams       []groupTeam `json:"teams"`
	CreatedAt   time.Time   `json:"createdAt"`
}

const memberGroupColumns = `g.id::text, g.name, g.description,
  (SELECT count(*) FROM member_group_members gm WHERE gm.group_id = g.id),
  COALESCE((SELECT json_agg(json_build_object('id', t.id::text, 'name', t.name, 'role', tg.role::text) ORDER BY lower(t.name))
            FROM team_groups tg JOIN teams t ON t.id = tg.team_id WHERE tg.group_id = g.id), '[]'::json),
  g.created_at`

func scanGroup(row pgx.Row) (memberGroup, error) {
	var g memberGroup
	var teams []byte
	if err := row.Scan(&g.ID, &g.Name, &g.Description, &g.MemberCount, &teams, &g.CreatedAt); err != nil {
		return memberGroup{}, err
	}
	g.Teams = []groupTeam{}
	_ = json.Unmarshal(teams, &g.Teams)
	return g, nil
}

func cleanGroupInput(name, description string) (string, string, string) {
	name, description = strings.TrimSpace(name), strings.TrimSpace(description)
	switch {
	case name == "" || len([]rune(name)) > 60:
		return "", "", "Use a group name of 1 to 60 characters."
	case len([]rune(description)) > 300:
		return "", "", "Keep the description under 300 characters."
	}
	return name, description, ""
}

type groupContextKey struct{}

// groupRoutes mounts /v1/groups.
func groupRoutes(db *pgxpool.Pool) func(chi.Router) {
	requireAdmin := func(w http.ResponseWriter, s identity.Session) bool {
		if !identity.CanManageAllTeams(s.Workspace.Role) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only workspace owners and admins can manage groups."})
			return false
		}
		return true
	}

	return func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			rows, err := db.Query(req.Context(), `SELECT `+memberGroupColumns+` FROM member_groups g WHERE g.organization_id = $1::uuid ORDER BY lower(g.name)`, s.Workspace.ID)
			if err != nil {
				slog.Error("list groups", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list groups"})
				return
			}
			defer rows.Close()
			data := []memberGroup{}
			for rows.Next() {
				g, err := scanGroup(rows)
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list groups"})
					return
				}
				data = append(data, g)
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": data, "canManage": identity.CanManageAllTeams(s.Workspace.Role)})
		})

		r.Post("/", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			if !requireAdmin(w, s) {
				return
			}
			var in struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 8<<10)).Decode(&in) != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			name, description, problem := cleanGroupInput(in.Name, in.Description)
			if problem != "" {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": problem})
				return
			}
			g, err := scanGroup(db.QueryRow(req.Context(), `WITH created AS (INSERT INTO member_groups (organization_id, name, description) VALUES ($1::uuid, $2, $3) RETURNING *)
SELECT `+memberGroupColumns+` FROM created g`, s.Workspace.ID, name, description))
			if err != nil {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "A group with this name already exists."})
				return
			}
			writeJSON(w, http.StatusCreated, g)
		})

		r.Route("/{groupID}", func(item chi.Router) {
			item.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
					s, _ := identity.SessionFromContext(req.Context())
					g, err := scanGroup(db.QueryRow(req.Context(), `SELECT `+memberGroupColumns+` FROM member_groups g WHERE g.id::text = $1 AND g.organization_id = $2::uuid`, chi.URLParam(req, "groupID"), s.Workspace.ID))
					if errors.Is(err, pgx.ErrNoRows) {
						writeJSON(w, http.StatusNotFound, map[string]string{"error": "group not found"})
						return
					}
					if err != nil {
						slog.Error("load group", "error", err)
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load group"})
						return
					}
					next.ServeHTTP(w, req.WithContext(context.WithValue(req.Context(), groupContextKey{}, g)))
				})
			})
			groupFrom := func(req *http.Request) memberGroup {
				g, _ := req.Context().Value(groupContextKey{}).(memberGroup)
				return g
			}

			item.Get("/", func(w http.ResponseWriter, req *http.Request) { writeJSON(w, http.StatusOK, groupFrom(req)) })

			item.Patch("/", func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				if !requireAdmin(w, s) {
					return
				}
				g := groupFrom(req)
				var in struct {
					Name        *string `json:"name"`
					Description *string `json:"description"`
				}
				if json.NewDecoder(http.MaxBytesReader(w, req.Body, 8<<10)).Decode(&in) != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
					return
				}
				name, description := g.Name, g.Description
				if in.Name != nil {
					name = *in.Name
				}
				if in.Description != nil {
					description = *in.Description
				}
				name, description, problem := cleanGroupInput(name, description)
				if problem != "" {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": problem})
					return
				}
				if _, err := db.Exec(req.Context(), `UPDATE member_groups SET name = $2, description = $3, updated_at = now() WHERE id = $1::uuid`, g.ID, name, description); err != nil {
					writeJSON(w, http.StatusConflict, map[string]string{"error": "A group with this name already exists."})
					return
				}
				g.Name, g.Description = name, description
				writeJSON(w, http.StatusOK, g)
			})

			item.Delete("/", func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				if !requireAdmin(w, s) {
					return
				}
				// Teams it was attached to lose the access it gave; people keep any access they have directly.
				if _, err := db.Exec(req.Context(), `DELETE FROM member_groups WHERE id = $1::uuid`, groupFrom(req).ID); err != nil {
					slog.Error("delete group", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete the group"})
					return
				}
				w.WriteHeader(http.StatusNoContent)
			})

			item.Get("/members", func(w http.ResponseWriter, req *http.Request) {
				rows, err := db.Query(req.Context(), `
SELECT u.id::text, u.name, u.email, m.role::text, u.created_at FROM member_group_members gm
JOIN users u ON u.id = gm.user_id
JOIN member_groups g ON g.id = gm.group_id
JOIN organization_memberships m ON m.organization_id = g.organization_id AND m.user_id = gm.user_id
WHERE gm.group_id = $1::uuid ORDER BY lower(u.name), u.email`, groupFrom(req).ID)
				if err != nil {
					slog.Error("list group members", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list group members"})
					return
				}
				defer rows.Close()
				members := []teamMember{}
				for rows.Next() {
					var m teamMember
					if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role, &m.AddedAt); err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list group members"})
						return
					}
					members = append(members, m)
				}
				writeJSON(w, http.StatusOK, map[string]any{"data": members})
			})

			item.Put("/members/{userID}", func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				if !requireAdmin(w, s) {
					return
				}
				tag, err := db.Exec(req.Context(), `
INSERT INTO member_group_members (group_id, user_id)
SELECT $1::uuid, m.user_id FROM organization_memberships m WHERE m.organization_id = $3::uuid AND m.user_id::text = $2
ON CONFLICT DO NOTHING`, groupFrom(req).ID, chi.URLParam(req, "userID"), s.Workspace.ID)
				if err != nil {
					slog.Error("add group member", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the group"})
					return
				}
				if tag.RowsAffected() == 0 {
					var already bool
					_ = db.QueryRow(req.Context(), `SELECT EXISTS (SELECT 1 FROM member_group_members WHERE group_id = $1::uuid AND user_id::text = $2)`, groupFrom(req).ID, chi.URLParam(req, "userID")).Scan(&already)
					if !already {
						writeJSON(w, http.StatusNotFound, map[string]string{"error": "That person isn't a member of this workspace."})
						return
					}
				}
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			})

			item.Delete("/members/{userID}", func(w http.ResponseWriter, req *http.Request) {
				s, _ := identity.SessionFromContext(req.Context())
				if !requireAdmin(w, s) {
					return
				}
				if _, err := db.Exec(req.Context(), `DELETE FROM member_group_members WHERE group_id = $1::uuid AND user_id::text = $2`, groupFrom(req).ID, chi.URLParam(req, "userID")); err != nil {
					slog.Error("remove group member", "error", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to update the group"})
					return
				}
				w.WriteHeader(http.StatusNoContent)
			})
		})
	}
}
