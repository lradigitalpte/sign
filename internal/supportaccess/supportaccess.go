// Package supportaccess records when a workspace lets Signet support open its documents. Access is
// read-only, time-limited and can be revoked at any time; without an active grant admins see metadata only.
package supportaccess

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Durations a customer can choose from.
var Durations = map[int]bool{24: true, 72: true, 168: true}

var (
	ErrDuration = errors.New("pick 24 hours, 3 days or 7 days")
	ErrNoGrant  = errors.New("support access isn't on")
)

type Grant struct {
	ID            string     `json:"id"`
	GrantedByName *string    `json:"grantedByName"`
	Note          *string    `json:"note"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	RevokedAt     *time.Time `json:"revokedAt"`
	RevokedByName *string    `json:"revokedByName"`
	CreatedAt     time.Time  `json:"createdAt"`
	Active        bool       `json:"active"`
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const columns = `g.id::text, gu.name, g.note, g.expires_at, g.revoked_at, ru.name, g.created_at, (g.revoked_at IS NULL AND g.expires_at > now())`

const from = ` FROM support_access_grants g LEFT JOIN users gu ON gu.id = g.granted_by LEFT JOIN users ru ON ru.id = g.revoked_by`

func scan(row pgx.Row) (Grant, error) {
	var g Grant
	err := row.Scan(&g.ID, &g.GrantedByName, &g.Note, &g.ExpiresAt, &g.RevokedAt, &g.RevokedByName, &g.CreatedAt, &g.Active)
	return g, err
}

// Current returns the active grant, or nil.
func Current(ctx context.Context, q querier, organizationID string) (*Grant, error) {
	g, err := scan(q.QueryRow(ctx, `SELECT `+columns+from+` WHERE g.organization_id = $1::uuid AND g.revoked_at IS NULL AND g.expires_at > now() ORDER BY g.expires_at DESC LIMIT 1`, organizationID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// History lists recent grants, newest first.
func History(ctx context.Context, q querier, organizationID string) ([]Grant, error) {
	rows, err := q.Query(ctx, `SELECT `+columns+from+` WHERE g.organization_id = $1::uuid ORDER BY g.created_at DESC LIMIT 20`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grants := []Grant{}
	for rows.Next() {
		g, err := scan(rows)
		if err != nil {
			return nil, err
		}
		grants = append(grants, g)
	}
	return grants, rows.Err()
}

// Allow turns access on for hours, replacing any active grant. Owners and admins only; the caller checks.
func Allow(ctx context.Context, db interface {
	Begin(context.Context) (pgx.Tx, error)
}, organizationID, userID string, hours int, note string) (Grant, error) {
	if !Durations[hours] {
		return Grant{}, ErrDuration
	}
	note = strings.TrimSpace(note)
	if len(note) > 300 {
		note = note[:300]
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return Grant{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE support_access_grants SET revoked_at = now(), revoked_by = $2::uuid WHERE organization_id = $1::uuid AND revoked_at IS NULL AND expires_at > now()`, organizationID, userID); err != nil {
		return Grant{}, err
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO support_access_grants (organization_id, granted_by, note, expires_at) VALUES ($1::uuid, $2::uuid, NULLIF($3, ''), now() + make_interval(hours => $4)) RETURNING id::text`, organizationID, userID, note, hours).Scan(&id); err != nil {
		return Grant{}, err
	}
	g, err := scan(tx.QueryRow(ctx, `SELECT `+columns+from+` WHERE g.id = $1::uuid`, id))
	if err != nil {
		return Grant{}, err
	}
	return g, tx.Commit(ctx)
}

// Revoke ends the active grant now.
func Revoke(ctx context.Context, q querier, organizationID, userID string) error {
	var id string
	err := q.QueryRow(ctx, `UPDATE support_access_grants SET revoked_at = now(), revoked_by = $2::uuid WHERE organization_id = $1::uuid AND revoked_at IS NULL AND expires_at > now() RETURNING id::text`, organizationID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNoGrant
	}
	return err
}
