package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/identity"
)

type workspaceOverview struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Personal  bool      `json:"personal"`
	CreatedAt time.Time `json:"createdAt"`
	// NameSyncsToWorkOS: renaming also renames the organization members sign in to.
	NameSyncsToWorkOS bool `json:"nameSyncsToWorkOS"`
}

// workspaceOverviewHandler serves GET /v1/workspace: the current workspace for the Organization page.
func workspaceOverviewHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		current, ok := identity.SessionFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		overview := workspaceOverview{ID: current.Workspace.ID, Personal: current.Workspace.Personal}
		if err := db.QueryRow(r.Context(), `SELECT name, created_at FROM organizations WHERE id = $1::uuid`, current.Workspace.ID).Scan(&overview.Name, &overview.CreatedAt); err != nil {
			slog.Error("load workspace overview", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load the workspace"})
			return
		}
		syncs, err := identity.SyncsNameToWorkOS(r.Context(), db, current.Workspace.ID)
		if err != nil {
			slog.Error("load workspace identity", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load the workspace"})
			return
		}
		overview.NameSyncsToWorkOS = syncs
		writeJSON(w, http.StatusOK, overview)
	}
}

// renameWorkspaceHandler serves PATCH /v1/workspace: owners and admins rename their workspace.
func renameWorkspaceHandler(db *pgxpool.Pool, directory identity.DirectoryAdmin) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		current, ok := identity.SessionFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only workspace owners and admins can rename the workspace."})
			return
		}
		var input struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		tx, err := db.Begin(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to rename the workspace"})
			return
		}
		defer tx.Rollback(r.Context())
		_, synced, err := identity.RenameWorkspace(r.Context(), tx, directory, current.Workspace.ID, input.Name)
		var rejected *identity.RenameRejectedError
		switch {
		case errors.Is(err, identity.ErrInvalidName):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Use a name of 1 to 100 characters."})
			return
		case errors.Is(err, identity.ErrNameUnchanged):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "That's already the name."})
			return
		case errors.Is(err, identity.ErrRenameUnavailable):
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "This workspace's name comes from your sign-in organization, which can't be reached right now. Try again later."})
			return
		case errors.As(err, &rejected):
			slog.Warn("workos refused workspace rename", "error", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "The sign-in service didn't accept that name. Try a different one."})
			return
		case err != nil:
			slog.Error("rename workspace", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to rename the workspace"})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to rename the workspace"})
			return
		}
		name, _ := identity.CleanWorkspaceName(input.Name)
		writeJSON(w, http.StatusOK, map[string]any{"name": name, "syncedToWorkOS": synced})
	}
}
