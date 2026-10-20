// Package features answers which feature flags are on for a workspace. Signet staff manage flags in the
// admin app: each has a global default, and individual workspaces can be switched on or off.
package features

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// ForWorkspace returns every flag with its value for this workspace: the override if there is one,
// otherwise the global default.
func ForWorkspace(ctx context.Context, db querier, organizationID string) (map[string]bool, error) {
	rows, err := db.Query(ctx, `
SELECT f.key, COALESCE(o.enabled, f.enabled)
FROM feature_flags f
LEFT JOIN feature_flag_overrides o ON o.flag_key = f.key AND o.organization_id = $1::uuid`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	flags := map[string]bool{}
	for rows.Next() {
		var key string
		var enabled bool
		if err := rows.Scan(&key, &enabled); err != nil {
			return nil, err
		}
		flags[key] = enabled
	}
	return flags, rows.Err()
}
