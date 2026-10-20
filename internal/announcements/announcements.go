// Package announcements serves the banners Signet staff publish in the admin app to the customer app.
package announcements

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type Announcement struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Severity  string     `json:"severity"` // info, warning or critical
	LinkURL   *string    `json:"linkUrl"`
	LinkLabel *string    `json:"linkLabel"`
	StartsAt  time.Time  `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// ForWorkspace returns the announcements showing right now to a workspace, most severe first.
// Announcements limited to plans only show to workspaces on one of them (no subscription means Free).
func ForWorkspace(ctx context.Context, q querier, organizationID string) ([]Announcement, error) {
	rows, err := q.Query(ctx, `
SELECT a.id::text, a.title, a.body, a.severity, a.link_url, a.link_label, a.starts_at, a.ends_at
FROM announcements a
WHERE a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now())
  AND (cardinality(a.plans) = 0 OR COALESCE((SELECT s.plan FROM organization_subscriptions s WHERE s.organization_id = $1::uuid), 'free') = ANY(a.plans))
ORDER BY array_position(ARRAY['critical', 'warning', 'info'], a.severity), a.starts_at DESC
LIMIT 3`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Announcement{}
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.Severity, &a.LinkURL, &a.LinkLabel, &a.StartsAt, &a.EndsAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}
