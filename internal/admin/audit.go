package admin

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---- Audit log ----

type AuditEntry struct {
	ID          string          `json:"id"`
	Action      string          `json:"action"`
	AdminUserID *string         `json:"adminUserId"`
	AdminName   *string         `json:"adminName"`
	AdminEmail  *string         `json:"adminEmail"`
	TargetType  string          `json:"targetType"`
	TargetID    string          `json:"targetId"`
	TargetLabel *string         `json:"targetLabel"`
	Reason      *string         `json:"reason"`
	Before      json.RawMessage `json:"before"`
	After       json.RawMessage `json:"after"`
	IPAddress   *string         `json:"ipAddress"`
	UserAgent   *string         `json:"userAgent"`
	OccurredAt  time.Time       `json:"occurredAt"`
}

type AuditFilter struct {
	Query      string // reason, target ID or label, or the admin's name or email
	AdminID    string
	TargetType string
	TargetID   string
}

var auditTargetTypes = map[string]bool{"workspace": true, "user": true, "envelope": true, "job": true, "admin": true, "flag": true, "webhook": true, "announcement": true, "deletion": true, "plan": true}

// A readable name for each target, looked up now (so a renamed workspace shows its current name).
const auditTargetLabel = `CASE a.target_type
  WHEN 'workspace' THEN (SELECT o.name FROM organizations o WHERE o.id::text = a.target_id)
  WHEN 'user' THEN (SELECT u2.email FROM users u2 WHERE u2.id::text = a.target_id)
  WHEN 'admin' THEN (SELECT u2.email FROM users u2 WHERE u2.id::text = a.target_id)
  WHEN 'envelope' THEN (SELECT e.title FROM envelopes e WHERE e.id::text = a.target_id)
  WHEN 'job' THEN (SELECT r.email FROM notification_jobs j JOIN recipients r ON r.id = j.recipient_id WHERE j.id::text = a.target_id)
  WHEN 'flag' THEN a.target_id
  WHEN 'webhook' THEN (SELECT w.event_type FROM auth_webhook_events w WHERE w.id::text = a.target_id)
  WHEN 'announcement' THEN (SELECT n.title FROM announcements n WHERE n.id::text = a.target_id)
  WHEN 'deletion' THEN (SELECT d.organization_name FROM workspace_deletion_requests d WHERE d.id::text = a.target_id)
  WHEN 'plan' THEN initcap(a.target_id)
END`

// ListAudit returns admin actions, newest first.
func (s *Service) ListAudit(ctx context.Context, filter AuditFilter, page Page) (List[AuditEntry], error) {
	page = page.normalize()
	query := strings.TrimSpace(filter.Query)
	targetType := filter.TargetType
	if !auditTargetTypes[targetType] {
		targetType = ""
	}
	where := ` WHERE ($1 = '' OR a.reason ILIKE $2 OR a.target_id = $1 OR a.action ILIKE $2 OR u.name ILIKE $2 OR u.email ILIKE $2 OR (` + auditTargetLabel + `) ILIKE $2)
  AND ($3::uuid IS NULL OR a.admin_user_id = $3::uuid)
  AND ($4 = '' OR a.target_type = $4)
  AND ($5 = '' OR a.target_id = $5)`
	args := []any{query, searchPattern(query), uuidOrNil(strings.TrimSpace(filter.AdminID)), targetType, strings.TrimSpace(filter.TargetID)}

	result := List[AuditEntry]{Items: []AuditEntry{}, Page: page.Number, PageSize: page.Size}
	from := ` FROM admin_audit_events a LEFT JOIN users u ON u.id = a.admin_user_id`
	if err := s.db.QueryRow(ctx, `SELECT count(*)`+from+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `
SELECT a.id::text, a.action, a.admin_user_id::text, u.name, u.email, a.target_type, a.target_id, `+auditTargetLabel+`,
       a.reason, a.before, a.after, a.ip_address, a.user_agent, a.occurred_at`+from+where+`
ORDER BY a.occurred_at DESC, a.id LIMIT $6 OFFSET $7`, append(args, page.Size, page.offset())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Action, &e.AdminUserID, &e.AdminName, &e.AdminEmail, &e.TargetType, &e.TargetID, &e.TargetLabel,
			&e.Reason, &e.Before, &e.After, &e.IPAddress, &e.UserAgent, &e.OccurredAt); err != nil {
			return result, err
		}
		result.Items = append(result.Items, e)
	}
	return result, rows.Err()
}

// ---- Admin management from the app ----

// GrantFromApp gives someone admin access or changes their role. Admins can't change their own role,
// so nobody can lock themselves out by accident.
func (s *Service) GrantFromApp(ctx context.Context, actor Actor, email string, role Role, reason string) (Admin, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return Admin{}, invalid("email_required", "Enter the person's email.")
	}
	if !role.Valid() {
		return Admin{}, invalid("invalid_role", "Pick read only, support or super admin.")
	}
	reason, err := cleanReason(reason, true)
	if err != nil {
		return Admin{}, err
	}
	if strings.EqualFold(email, actor.Admin.Email) {
		return Admin{}, conflict("self", "You can't change your own admin role.")
	}
	userID := actor.Admin.UserID
	a, err := s.grant(ctx, email, role, &userID, reason)
	switch {
	case errors.Is(err, ErrUserNotFound):
		return Admin{}, invalid("user_not_found", "Nobody with that email has signed in to Signet yet. They need to sign in once first.")
	case errors.Is(err, ErrLastSuper):
		return Admin{}, conflict("last_super", "There must be at least one super admin.")
	}
	return a, err
}

// RevokeFromApp removes someone's admin access.
func (s *Service) RevokeFromApp(ctx context.Context, actor Actor, userID, reason string) error {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return err
	}
	if userID == actor.Admin.UserID {
		return conflict("self", "You can't remove your own admin access.")
	}
	var email string
	err = s.db.QueryRow(ctx, `SELECT u.email FROM platform_admins a JOIN users u ON u.id = a.user_id WHERE a.user_id::text = $1`, userID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	actorID := actor.Admin.UserID
	err = s.Revoke(ctx, email, &actorID, reason)
	if errors.Is(err, ErrLastSuper) {
		return conflict("last_super", "There must be at least one super admin.")
	}
	return err
}
