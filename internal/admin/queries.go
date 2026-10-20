package admin

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/billing"
	"signing-platform/internal/lifecycle"
)

var ErrNotFound = errors.New("not found")

// Page is a 1-based page request. Normalize before use.
type Page struct {
	Number int
	Size   int
}

func (p Page) normalize() Page {
	if p.Number < 1 {
		p.Number = 1
	}
	if p.Size < 1 || p.Size > 100 {
		p.Size = 25
	}
	return p
}

func (p Page) offset() int { return (p.Number - 1) * p.Size }

type List[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// searchPattern turns free text into an ILIKE pattern, escaping wildcards.
func searchPattern(query string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(strings.TrimSpace(query))
	return "%" + escaped + "%"
}

// ---- Dashboard ----

type Stats struct {
	Workspaces struct {
		Total     int `json:"total"`
		New7d     int `json:"new7d"`
		Suspended int `json:"suspended"`
	} `json:"workspaces"`
	Users struct {
		Total     int `json:"total"`
		New7d     int `json:"new7d"`
		Suspended int `json:"suspended"`
	} `json:"users"`
	Envelopes struct {
		ByStatus    map[string]int `json:"byStatus"`
		Sent7d      int            `json:"sent7d"`
		Completed7d int            `json:"completed7d"`
	} `json:"envelopes"`
	EmailJobs struct {
		Pending int `json:"pending"`
		Failed  int `json:"failed"`
	} `json:"emailJobs"`
	WebhooksUnprocessed int `json:"webhooksUnprocessed"`
	// Workspaces per plan, including "free" for those without a subscription.
	Plans map[string]int `json:"plans"`
	// One entry per UTC day, oldest first, ending today.
	Activity []DayActivity `json:"activity"`
}

type DayActivity struct {
	Date      string `json:"date"`
	Sent      int    `json:"sent"`
	Completed int    `json:"completed"`
}

// ActivityDays clamps the dashboard's activity window.
func ActivityDays(days int) int {
	if days < 7 {
		return 30
	}
	if days > 180 {
		return 180
	}
	return days
}

func (s *Service) Stats(ctx context.Context, activityDays int) (Stats, error) {
	var st Stats
	err := s.db.QueryRow(ctx, `
SELECT
  (SELECT count(*) FROM organizations),
  (SELECT count(*) FROM organizations WHERE created_at > now() - interval '7 days'),
  (SELECT count(*) FROM organizations WHERE suspended_at IS NOT NULL),
  (SELECT count(*) FROM users),
  (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'),
  (SELECT count(*) FROM users WHERE suspended_at IS NOT NULL),
  (SELECT count(*) FROM envelopes WHERE sent_at > now() - interval '7 days'),
  (SELECT count(*) FROM envelopes WHERE completed_at > now() - interval '7 days'),
  (SELECT count(*) FROM notification_jobs WHERE status IN ('pending', 'processing')),
  (SELECT count(*) FROM notification_jobs WHERE status = 'failed'),
  (SELECT count(*) FROM auth_webhook_events WHERE processed_at IS NULL)`).Scan(
		&st.Workspaces.Total, &st.Workspaces.New7d, &st.Workspaces.Suspended,
		&st.Users.Total, &st.Users.New7d, &st.Users.Suspended,
		&st.Envelopes.Sent7d, &st.Envelopes.Completed7d,
		&st.EmailJobs.Pending, &st.EmailJobs.Failed,
		&st.WebhooksUnprocessed,
	)
	if err != nil {
		return Stats{}, err
	}
	if st.Envelopes.ByStatus, err = s.countByStatus(ctx, `SELECT status::text, count(*) FROM envelopes GROUP BY status`); err != nil {
		return st, err
	}
	if st.Plans, err = s.planCounts(ctx); err != nil {
		return st, err
	}
	st.Activity, err = s.activity(ctx, ActivityDays(activityDays))
	return st, err
}

func (s *Service) planCounts(ctx context.Context) (map[string]int, error) {
	counts := map[string]int{}
	for _, plan := range billing.Plans {
		counts[plan] = 0
	}
	rows, err := s.db.Query(ctx, `
SELECT COALESCE(s.plan, 'free'), count(*) FROM organizations o
LEFT JOIN organization_subscriptions s ON s.organization_id = o.id GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var plan string
		var count int
		if err := rows.Scan(&plan, &count); err != nil {
			return nil, err
		}
		counts[plan] = count
	}
	return counts, rows.Err()
}

func (s *Service) activity(ctx context.Context, days int) ([]DayActivity, error) {
	rows, err := s.db.Query(ctx, `
WITH days AS (
  SELECT generate_series((now() AT TIME ZONE 'UTC')::date - ($1::int - 1), (now() AT TIME ZONE 'UTC')::date, interval '1 day')::date AS day
),
sent AS (
  SELECT (sent_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM envelopes
  WHERE sent_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1) GROUP BY 1
),
completed AS (
  SELECT (completed_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n FROM envelopes
  WHERE completed_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1) GROUP BY 1
)
SELECT to_char(d.day, 'YYYY-MM-DD'), COALESCE(sent.n, 0), COALESCE(completed.n, 0)
FROM days d LEFT JOIN sent ON sent.day = d.day LEFT JOIN completed ON completed.day = d.day
ORDER BY d.day`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	activity := make([]DayActivity, 0, days)
	for rows.Next() {
		var day DayActivity
		if err := rows.Scan(&day.Date, &day.Sent, &day.Completed); err != nil {
			return nil, err
		}
		activity = append(activity, day)
	}
	return activity, rows.Err()
}

func (s *Service) countByStatus(ctx context.Context, sql string, args ...any) (map[string]int, error) {
	counts := map[string]int{"draft": 0, "in_progress": 0, "completed": 0, "voided": 0, "expired": 0}
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts[status] = count
	}
	return counts, rows.Err()
}

// ---- Workspaces ----

type WorkspaceSummary struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Slug            string     `json:"slug"`
	OwnerEmail      *string    `json:"ownerEmail"`
	MemberCount     int        `json:"memberCount"`
	EnvelopeCount   int        `json:"envelopeCount"`
	Plan            string     `json:"plan"`
	CreatedAt       time.Time  `json:"createdAt"`
	SuspendedAt     *time.Time `json:"suspendedAt"`
	SuspendedReason *string    `json:"suspendedReason"`
}

const workspaceSummaryColumns = `
  o.id::text, o.name, o.slug,
  (SELECT u.email FROM organization_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1),
  (SELECT count(*) FROM organization_memberships m WHERE m.organization_id = o.id),
  (SELECT count(*) FROM envelopes e WHERE e.organization_id = o.id),
  COALESCE((SELECT s.plan FROM organization_subscriptions s WHERE s.organization_id = o.id), 'free'),
  o.created_at, o.suspended_at, o.suspended_reason`

func scanWorkspaceSummary(row pgx.Row) (WorkspaceSummary, error) {
	var w WorkspaceSummary
	err := row.Scan(&w.ID, &w.Name, &w.Slug, &w.OwnerEmail, &w.MemberCount, &w.EnvelopeCount, &w.Plan, &w.CreatedAt, &w.SuspendedAt, &w.SuspendedReason)
	return w, err
}

// ListWorkspaces searches by name, slug, ID or a member's email. status is "", "active" or "suspended";
// plan is "" or a plan ID.
func (s *Service) ListWorkspaces(ctx context.Context, query, status, plan string, page Page) (List[WorkspaceSummary], error) {
	page = page.normalize()
	where := `($1 = '' OR o.id::text = $1 OR o.name ILIKE $2 OR o.slug ILIKE $2 OR EXISTS (
    SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = o.id AND u.email ILIKE $2))
  AND ($3 = '' OR ($3 = 'suspended') = (o.suspended_at IS NOT NULL))
  AND ($4 = '' OR COALESCE((SELECT s.plan FROM organization_subscriptions s WHERE s.organization_id = o.id), 'free') = $4)`
	query = strings.TrimSpace(query)
	if !billing.ValidPlan(plan) {
		plan = ""
	}
	args := []any{query, searchPattern(query), status, plan}

	result := List[WorkspaceSummary]{Items: []WorkspaceSummary{}, Page: page.Number, PageSize: page.Size}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM organizations o WHERE `+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `SELECT `+workspaceSummaryColumns+` FROM organizations o WHERE `+where+` ORDER BY o.created_at DESC LIMIT $5 OFFSET $6`,
		append(args, page.Size, page.offset())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		w, err := scanWorkspaceSummary(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, w)
	}
	return result, rows.Err()
}

type WorkspaceMember struct {
	UserID   string    `json:"userId"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

type WorkspaceInvitation struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

type WorkspaceDetail struct {
	WorkspaceSummary
	EnvelopesByStatus map[string]int        `json:"envelopesByStatus"`
	Subscription      AdminSubscription     `json:"subscription"`
	Privacy           WorkspacePrivacy      `json:"privacy"`
	StorageProvider   string                `json:"storageProvider"`
	SettingsSections  []string              `json:"settingsSections"`
	Members           []WorkspaceMember     `json:"members"`
	Invitations       []WorkspaceInvitation `json:"invitations"`
}

func (s *Service) GetWorkspace(ctx context.Context, id string) (WorkspaceDetail, error) {
	summary, err := scanWorkspaceSummary(s.db.QueryRow(ctx, `SELECT `+workspaceSummaryColumns+` FROM organizations o WHERE o.id::text = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return WorkspaceDetail{}, ErrNotFound
	}
	if err != nil {
		return WorkspaceDetail{}, err
	}
	detail := WorkspaceDetail{WorkspaceSummary: summary, Members: []WorkspaceMember{}, Invitations: []WorkspaceInvitation{}, SettingsSections: []string{}}

	if detail.EnvelopesByStatus, err = s.countByStatus(ctx, `SELECT status::text, count(*) FROM envelopes WHERE organization_id = $1::uuid GROUP BY status`, id); err != nil {
		return detail, err
	}
	if detail.Subscription, err = s.subscription(ctx, id); err != nil {
		return detail, err
	}
	if detail.Privacy, err = s.workspacePrivacy(ctx, id); err != nil {
		return detail, err
	}
	// Only the provider name: storage credentials never leave the API.
	if err := s.db.QueryRow(ctx, `SELECT COALESCE((SELECT config->>'provider' FROM organization_settings WHERE organization_id = $1::uuid AND section = 'storage'), 'platform')`, id).Scan(&detail.StorageProvider); err != nil {
		return detail, err
	}
	sections, err := s.db.Query(ctx, `SELECT section FROM organization_settings WHERE organization_id = $1::uuid ORDER BY section`, id)
	if err != nil {
		return detail, err
	}
	for sections.Next() {
		var section string
		if err := sections.Scan(&section); err != nil {
			sections.Close()
			return detail, err
		}
		detail.SettingsSections = append(detail.SettingsSections, section)
	}
	sections.Close()

	members, err := s.db.Query(ctx, `
SELECT u.id::text, u.name, u.email, m.role::text, m.created_at
FROM organization_memberships m JOIN users u ON u.id = m.user_id
WHERE m.organization_id = $1::uuid
ORDER BY array_position(ARRAY['owner','admin','member','viewer'], m.role::text), u.name`, id)
	if err != nil {
		return detail, err
	}
	for members.Next() {
		var m WorkspaceMember
		if err := members.Scan(&m.UserID, &m.Name, &m.Email, &m.Role, &m.JoinedAt); err != nil {
			members.Close()
			return detail, err
		}
		detail.Members = append(detail.Members, m)
	}
	members.Close()

	invitations, err := s.db.Query(ctx, `
SELECT id::text, email, role::text, status::text, expires_at, created_at
FROM organization_invitations WHERE organization_id = $1::uuid
ORDER BY created_at DESC LIMIT 50`, id)
	if err != nil {
		return detail, err
	}
	defer invitations.Close()
	for invitations.Next() {
		var inv WorkspaceInvitation
		if err := invitations.Scan(&inv.ID, &inv.Email, &inv.Role, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return detail, err
		}
		detail.Invitations = append(detail.Invitations, inv)
	}
	return detail, invitations.Err()
}

// ---- Users ----

type UserSummary struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	WorkspaceCount  int        `json:"workspaceCount"`
	AdminRole       *string    `json:"adminRole"`
	CreatedAt       time.Time  `json:"createdAt"`
	SuspendedAt     *time.Time `json:"suspendedAt"`
	SuspendedReason *string    `json:"suspendedReason"`
	// DeletedAt is set once the person deleted their account; the record stays, anonymized.
	DeletedAt *time.Time `json:"deletedAt"`
}

const userSummaryColumns = `
  u.id::text, u.email, u.name,
  (SELECT count(*) FROM organization_memberships m WHERE m.user_id = u.id),
  (SELECT a.role::text FROM platform_admins a WHERE a.user_id = u.id),
  u.created_at, u.suspended_at, u.suspended_reason, u.deleted_at`

func scanUserSummary(row pgx.Row) (UserSummary, error) {
	var u UserSummary
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.WorkspaceCount, &u.AdminRole, &u.CreatedAt, &u.SuspendedAt, &u.SuspendedReason, &u.DeletedAt)
	return u, err
}

// ListUsers searches by email, name or ID. status is "", "active" or "suspended".
func (s *Service) ListUsers(ctx context.Context, query, status string, page Page) (List[UserSummary], error) {
	page = page.normalize()
	where := `($1 = '' OR u.id::text = $1 OR u.email ILIKE $2 OR u.name ILIKE $2)
  AND ($3 = '' OR ($3 = 'suspended') = (u.suspended_at IS NOT NULL))`
	query = strings.TrimSpace(query)
	args := []any{query, searchPattern(query), status}

	result := List[UserSummary]{Items: []UserSummary{}, Page: page.Number, PageSize: page.Size}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM users u WHERE `+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := s.db.Query(ctx, `SELECT `+userSummaryColumns+` FROM users u WHERE `+where+` ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`,
		append(args, page.Size, page.offset())...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		u, err := scanUserSummary(rows)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, u)
	}
	return result, rows.Err()
}

type UserMembership struct {
	WorkspaceID   string    `json:"workspaceId"`
	WorkspaceName string    `json:"workspaceName"`
	Role          string    `json:"role"`
	JoinedAt      time.Time `json:"joinedAt"`
}

type UserIdentity struct {
	Provider  string    `json:"provider"`
	Email     *string   `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserDetail struct {
	UserSummary
	EmailVerifiedAt *time.Time       `json:"emailVerifiedAt"`
	EnvelopesSent   int              `json:"envelopesSent"`
	Memberships     []UserMembership `json:"memberships"`
	Identities      []UserIdentity   `json:"identities"`
	// AccountDeletion is the person's open request to delete their account, if any.
	AccountDeletion *lifecycle.AccountDeletionRequest `json:"accountDeletion"`
}

func (s *Service) GetUser(ctx context.Context, id string) (UserDetail, error) {
	summary, err := scanUserSummary(s.db.QueryRow(ctx, `SELECT `+userSummaryColumns+` FROM users u WHERE u.id::text = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return UserDetail{}, ErrNotFound
	}
	if err != nil {
		return UserDetail{}, err
	}
	detail := UserDetail{UserSummary: summary, Memberships: []UserMembership{}, Identities: []UserIdentity{}}
	if err := s.db.QueryRow(ctx, `SELECT email_verified_at, (SELECT count(*) FROM envelopes WHERE created_by = $1::uuid AND sent_at IS NOT NULL) FROM users WHERE id = $1::uuid`, id).
		Scan(&detail.EmailVerifiedAt, &detail.EnvelopesSent); err != nil {
		return detail, err
	}
	if detail.AccountDeletion, err = lifecycle.PendingAccountDeletion(ctx, s.db, id); err != nil {
		return detail, err
	}

	memberships, err := s.db.Query(ctx, `
SELECT o.id::text, o.name, m.role::text, m.created_at
FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
WHERE m.user_id = $1::uuid ORDER BY m.created_at`, id)
	if err != nil {
		return detail, err
	}
	for memberships.Next() {
		var m UserMembership
		if err := memberships.Scan(&m.WorkspaceID, &m.WorkspaceName, &m.Role, &m.JoinedAt); err != nil {
			memberships.Close()
			return detail, err
		}
		detail.Memberships = append(detail.Memberships, m)
	}
	memberships.Close()

	// Provider subjects are omitted on purpose; staff only need to know how the user signs in.
	identities, err := s.db.Query(ctx, `SELECT provider, provider_email, created_at FROM auth_identities WHERE user_id = $1::uuid ORDER BY created_at`, id)
	if err != nil {
		return detail, err
	}
	defer identities.Close()
	for identities.Next() {
		var i UserIdentity
		if err := identities.Scan(&i.Provider, &i.Email, &i.CreatedAt); err != nil {
			return detail, err
		}
		detail.Identities = append(detail.Identities, i)
	}
	return detail, identities.Err()
}
