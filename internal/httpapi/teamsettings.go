package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/identity"
)

// Sections a team can customize. Everything else is set once for the whole workspace.
var teamSettingSections = map[string]bool{"preferences": true, "notifications": true, "branding": true}

type teamSettingsView struct {
	Section      string          `json:"section"`
	Team         identity.Team   `json:"team"`
	Organization json.RawMessage `json:"organization"` // the workspace's settings
	Overrides    json.RawMessage `json:"overrides"`    // what this team changed; {} when it uses the workspace's
	Effective    json.RawMessage `json:"effective"`    // what applies to the team's envelopes
	Customized   bool            `json:"customized"`
	// CanEdit: workspace owners and admins, and the team's admins, can customize a team (never the default team).
	CanEdit bool `json:"canEdit"`
}

func canEditTeamSettings(session identity.Session) bool {
	if session.Team.ID == "" || session.Team.IsDefault {
		return false
	}
	return identity.CanManageAllTeams(session.Workspace.Role) || session.Team.Role == "owner" || session.Team.Role == "admin"
}

// teamSettingsRoutes mounts /v1/team/settings/{section}: the request's team's settings for one section.
func teamSettingsRoutes(db *pgxpool.Pool) func(chi.Router) {
	load := func(w http.ResponseWriter, r *http.Request, session identity.Session, section string) {
		view := teamSettingsView{Section: section, Team: session.Team, CanEdit: canEditTeamSettings(session)}
		err := db.QueryRow(r.Context(), `
SELECT COALESCE((SELECT config FROM organization_settings WHERE organization_id = $1::uuid AND section = $3), '{}'::jsonb),
       COALESCE((SELECT config FROM team_settings WHERE team_id::text = $2 AND section = $3), '{}'::jsonb),
       effective_settings($1::uuid, NULLIF($2, '')::uuid, $3),
       EXISTS (SELECT 1 FROM team_settings WHERE team_id::text = $2 AND section = $3 AND config <> '{}'::jsonb)`,
			session.Workspace.ID, session.Team.ID, section).Scan(&view.Organization, &view.Overrides, &view.Effective, &view.Customized)
		if err != nil {
			slog.Error("load team settings", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load settings"})
			return
		}
		writeJSON(w, http.StatusOK, view)
	}

	return func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			section := chi.URLParam(r, "section")
			if !teamSettingSections[section] {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "This setting can't be customized per team."})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			load(w, r, session, section)
		})

		// PUT {"overrides": {...}} saves the team's own values; {"overrides": null} or {} goes back to the workspace's.
		r.Put("/", func(w http.ResponseWriter, r *http.Request) {
			section := chi.URLParam(r, "section")
			if !teamSettingSections[section] {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "This setting can't be customized per team."})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			if session.Team.IsDefault {
				writeJSON(w, http.StatusConflict, map[string]string{"error": "The default team always uses the workspace's settings. Change them for the whole workspace instead."})
				return
			}
			if !canEditTeamSettings(session) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only team admins and workspace admins can customize this team."})
				return
			}
			var input struct {
				Overrides map[string]any `json:"overrides"`
			}
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid settings"})
				return
			}
			for key, value := range input.Overrides {
				if value == nil {
					delete(input.Overrides, key)
				}
			}
			var err error
			if len(input.Overrides) == 0 {
				_, err = db.Exec(r.Context(), `DELETE FROM team_settings WHERE team_id = $1::uuid AND section = $2`, session.Team.ID, section)
			} else {
				_, err = db.Exec(r.Context(), `
INSERT INTO team_settings (team_id, section, config, updated_by) VALUES ($1::uuid, $2, $3, $4::uuid)
ON CONFLICT (team_id, section) DO UPDATE SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = now()`,
					session.Team.ID, section, input.Overrides, session.User.ID)
			}
			if err != nil {
				slog.Error("save team settings", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to save settings"})
				return
			}
			load(w, r, session, section)
		})
	}
}
