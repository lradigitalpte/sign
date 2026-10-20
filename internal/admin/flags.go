package admin

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"signing-platform/internal/features"
)

// ---- Feature flags ----

var flagKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_.-]{1,62}$`)

type FlagOverride struct {
	WorkspaceID   string    `json:"workspaceId"`
	WorkspaceName string    `json:"workspaceName"`
	Enabled       bool      `json:"enabled"`
	CreatedAt     time.Time `json:"createdAt"`
}

type FeatureFlag struct {
	Key         string         `json:"key"`
	Description string         `json:"description"`
	Enabled     bool           `json:"enabled"`
	Overrides   []FlagOverride `json:"overrides"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

func (s *Service) ListFlags(ctx context.Context) ([]FeatureFlag, error) {
	flags, err := queryAll(ctx, s, `SELECT key, description, enabled, created_at, updated_at FROM feature_flags ORDER BY key`, nil,
		func(row pgx.Rows, v *FeatureFlag) error {
			return row.Scan(&v.Key, &v.Description, &v.Enabled, &v.CreatedAt, &v.UpdatedAt)
		})
	if err != nil {
		return nil, err
	}
	overrides, err := queryAll(ctx, s, `
SELECT o.flag_key, o.organization_id::text, org.name, o.enabled, o.created_at
FROM feature_flag_overrides o JOIN organizations org ON org.id = o.organization_id
ORDER BY org.name`, nil,
		func(row pgx.Rows, v *struct {
			key string
			FlagOverride
		}) error {
			return row.Scan(&v.key, &v.WorkspaceID, &v.WorkspaceName, &v.Enabled, &v.CreatedAt)
		})
	if err != nil {
		return nil, err
	}
	byKey := map[string]*FeatureFlag{}
	for i := range flags {
		flags[i].Overrides = []FlagOverride{}
		byKey[flags[i].Key] = &flags[i]
	}
	for _, o := range overrides {
		if flag := byKey[o.key]; flag != nil {
			flag.Overrides = append(flag.Overrides, o.FlagOverride)
		}
	}
	return flags, nil
}

type FlagInput struct {
	Key         string `json:"key"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Reason      string `json:"reason"`
}

// CreateFlag adds a flag. New flags start with the global default the admin picks (usually off).
func (s *Service) CreateFlag(ctx context.Context, actor Actor, input FlagInput) error {
	key := strings.TrimSpace(input.Key)
	if !flagKeyPattern.MatchString(key) {
		return invalid("invalid_key", "Use 2–63 lowercase letters, numbers, dots, dashes or underscores, starting with a letter.")
	}
	description := strings.TrimSpace(input.Description)
	if len(description) > 300 {
		return invalid("description_too_long", "Keep the description under 300 characters.")
	}
	reason, err := cleanReason(input.Reason, false)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO feature_flags (key, description, enabled) VALUES ($1, $2, $3)`, key, description, input.Enabled)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return conflict("exists", "A flag with this key already exists.")
	}
	if err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, actor.target("flag", "flag.create", key, reason, nil, map[string]any{"enabled": input.Enabled, "description": description})); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetFlagDefault switches a flag on or off for every workspace without an override.
func (s *Service) SetFlagDefault(ctx context.Context, actor Actor, key string, enabled bool, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var previous bool
	err = tx.QueryRow(ctx, `SELECT enabled FROM feature_flags WHERE key = $1 FOR UPDATE`, key).Scan(&previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if previous == enabled {
		return conflict("unchanged", "The flag is already set that way.")
	}
	if _, err := tx.Exec(ctx, `UPDATE feature_flags SET enabled = $2, updated_at = now() WHERE key = $1`, key, enabled); err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, actor.target("flag", "flag.default", key, reason, map[string]bool{"enabled": previous}, map[string]bool{"enabled": enabled})); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetFlagOverride turns a flag on or off for one workspace; nil removes the override so the default applies.
func (s *Service) SetFlagOverride(ctx context.Context, actor Actor, key, workspaceID string, enabled *bool, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	if uuidOrNil(workspaceID) == nil {
		return ErrNotFound
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var flagExists, workspaceExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM feature_flags WHERE key = $1), EXISTS (SELECT 1 FROM organizations WHERE id = $2::uuid)`, key, workspaceID).Scan(&flagExists, &workspaceExists); err != nil {
		return err
	}
	if !flagExists || !workspaceExists {
		return ErrNotFound
	}
	var previous *bool
	if err := tx.QueryRow(ctx, `SELECT enabled FROM feature_flag_overrides WHERE flag_key = $1 AND organization_id = $2::uuid`, key, workspaceID).Scan(&previous); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if enabled == nil {
		_, err = tx.Exec(ctx, `DELETE FROM feature_flag_overrides WHERE flag_key = $1 AND organization_id = $2::uuid`, key, workspaceID)
	} else {
		_, err = tx.Exec(ctx, `
INSERT INTO feature_flag_overrides (flag_key, organization_id, enabled) VALUES ($1, $2::uuid, $3)
ON CONFLICT (flag_key, organization_id) DO UPDATE SET enabled = EXCLUDED.enabled`, key, workspaceID, *enabled)
	}
	if err != nil {
		return err
	}
	event := actor.target("flag", "flag.override", key, reason, map[string]any{"workspaceId": workspaceID, "override": previous}, map[string]any{"workspaceId": workspaceID, "override": enabled})
	if err := RecordAudit(ctx, tx, event); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeleteFlag removes a flag and its overrides. Code that still checks it will see it as off.
func (s *Service) DeleteFlag(ctx context.Context, actor Actor, key, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var enabled bool
	err = tx.QueryRow(ctx, `DELETE FROM feature_flags WHERE key = $1 RETURNING enabled`, key).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := RecordAudit(ctx, tx, actor.target("flag", "flag.delete", key, reason, map[string]bool{"enabled": enabled}, nil)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// WorkspaceFlags lists every flag's effective value for one workspace, for the workspace page.
func (s *Service) WorkspaceFlags(ctx context.Context, workspaceID string) (map[string]bool, error) {
	if uuidOrNil(workspaceID) == nil {
		return nil, ErrNotFound
	}
	return features.ForWorkspace(ctx, s.db, workspaceID)
}
