package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/identity"
)

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func collaborationRoutes(db *pgxpool.Pool) func(chi.Router) {
	return func(r chi.Router) {
		r.Get("/teams", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			rows, err := db.Query(req.Context(), `SELECT t.id::text,t.name,t.slug,t.created_at,count(tm.user_id) FROM teams t LEFT JOIN team_memberships tm ON tm.team_id=t.id WHERE t.organization_id=$1::uuid GROUP BY t.id ORDER BY t.name`, s.Workspace.ID)
			if err != nil {
				writeJSON(w, 500, map[string]string{"error": "unable to list teams"})
				return
			}
			defer rows.Close()
			data := []map[string]any{}
			for rows.Next() {
				var id, name, slug string
				var created any
				var count int
				if rows.Scan(&id, &name, &slug, &created, &count) == nil {
					data = append(data, map[string]any{"id": id, "name": name, "slug": slug, "createdAt": created, "memberCount": count})
				}
			}

			if len(data) == 0 && s.Workspace.ID != "" && s.User.ID != "" {
				defaultName := s.Workspace.Name
				if strings.TrimSpace(defaultName) == "" {
					defaultName = "Personal Team"
				}
				slug := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(defaultName), "-"), "-")
				if slug == "" {
					slug = "personal-team"
				}
				var defID string
				var defCreated any
				_ = db.QueryRow(req.Context(), `WITH created AS (
					INSERT INTO teams(organization_id,name,slug,created_by)
					VALUES($1::uuid, $2, $3, $4::uuid)
					ON CONFLICT (organization_id, slug) DO UPDATE SET name=EXCLUDED.name
					RETURNING id, created_at
				)
				INSERT INTO team_memberships(team_id,user_id,role)
				SELECT id, $4::uuid, 'owner' FROM created
				ON CONFLICT (team_id, user_id) DO NOTHING
				RETURNING (SELECT id::text FROM created), (SELECT created_at FROM created)`,
					s.Workspace.ID, defaultName, slug, s.User.ID).Scan(&defID, &defCreated)

				if defID != "" {
					data = append(data, map[string]any{
						"id":          defID,
						"name":        defaultName,
						"slug":        slug,
						"createdAt":   defCreated,
						"memberCount": 1,
					})
				}
			}
			writeJSON(w, 200, map[string]any{"data": data})
		})
		r.Post("/teams", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			if s.Workspace.Role != "owner" && s.Workspace.Role != "admin" {
				writeJSON(w, 403, map[string]string{"error": "administrator access required"})
				return
			}
			var in struct {
				Name string `json:"name"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 1<<20)).Decode(&in) != nil || strings.TrimSpace(in.Name) == "" {
				writeJSON(w, 400, map[string]string{"error": "name is required"})
				return
			}
			name := strings.TrimSpace(in.Name)
			slug := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(name), "-"), "-")
			var id string
			err := db.QueryRow(req.Context(), `WITH created AS (INSERT INTO teams(organization_id,name,slug,created_by) VALUES($1::uuid,$2,$3,$4::uuid) RETURNING id) INSERT INTO team_memberships(team_id,user_id,role) SELECT id,$4::uuid,'owner' FROM created RETURNING team_id::text`, s.Workspace.ID, name, slug, s.User.ID).Scan(&id)
			if err != nil {
				writeJSON(w, 400, map[string]string{"error": "a team with this name already exists"})
				return
			}
			writeJSON(w, 201, map[string]any{"id": id, "name": name, "slug": slug, "memberCount": 1})
		})
		r.Get("/groups", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			rows, err := db.Query(req.Context(), `SELECT g.id::text,g.name,g.description,count(gm.user_id) FROM member_groups g LEFT JOIN member_group_members gm ON gm.group_id=g.id WHERE g.organization_id=$1::uuid GROUP BY g.id ORDER BY g.name`, s.Workspace.ID)
			if err != nil {
				writeJSON(w, 500, map[string]string{"error": "unable to list groups"})
				return
			}
			defer rows.Close()
			data := []map[string]any{}
			for rows.Next() {
				var id, name, description string
				var count int
				if rows.Scan(&id, &name, &description, &count) == nil {
					data = append(data, map[string]any{"id": id, "name": name, "description": description, "memberCount": count})
				}
			}
			writeJSON(w, 200, map[string]any{"data": data})
		})
		r.Post("/groups", func(w http.ResponseWriter, req *http.Request) {
			s, _ := identity.SessionFromContext(req.Context())
			if s.Workspace.Role != "owner" && s.Workspace.Role != "admin" {
				writeJSON(w, 403, map[string]string{"error": "administrator access required"})
				return
			}
			var in struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, req.Body, 1<<20)).Decode(&in) != nil || strings.TrimSpace(in.Name) == "" {
				writeJSON(w, 400, map[string]string{"error": "name is required"})
				return
			}
			var id string
			err := db.QueryRow(req.Context(), `INSERT INTO member_groups(organization_id,name,description) VALUES($1::uuid,$2,$3) RETURNING id::text`, s.Workspace.ID, strings.TrimSpace(in.Name), strings.TrimSpace(in.Description)).Scan(&id)
			if err != nil {
				writeJSON(w, 400, map[string]string{"error": "a group with this name already exists"})
				return
			}
			writeJSON(w, 201, map[string]any{"id": id, "name": strings.TrimSpace(in.Name), "description": strings.TrimSpace(in.Description), "memberCount": 0})
		})
	}
}
