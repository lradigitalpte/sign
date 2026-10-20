package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/billing"
)

// ---- Plan prices and revenue ----

type PlanPriceInput struct {
	MonthlyCents *int   `json:"monthlyCents"`
	AnnualCents  *int   `json:"annualCents"`
	Reason       string `json:"reason"`
}

// SetPlanPrice changes a plan's list price. Existing subscriptions keep what they pay; new ones, and
// workspaces staff move onto the list price, get the new price. The pricing page picks it up within a minute.
func (s *Service) SetPlanPrice(ctx context.Context, actor Actor, plan string, input PlanPriceInput) (billing.PlanPrice, error) {
	reason, err := cleanReason(input.Reason, true)
	if err != nil {
		return billing.PlanPrice{}, err
	}
	if !billing.ValidPlan(plan) || plan == "free" {
		return billing.PlanPrice{}, ErrNotFound
	}
	monthly, annual := input.MonthlyCents, input.AnnualCents
	switch {
	case monthly == nil && annual == nil:
		if plan != "enterprise" {
			return billing.PlanPrice{}, invalid("price_required", "Only Enterprise can be sold through sales without a listed price.")
		}
	case monthly == nil || annual == nil:
		return billing.PlanPrice{}, invalid("price_incomplete", "Set both the monthly and the annual price.")
	case *monthly < 0 || *monthly > maxSeatPriceCents || *annual < 0 || *annual > maxSeatPriceCents:
		return billing.PlanPrice{}, invalid("invalid_price", "Prices must be between $0 and $100,000 per seat.")
	case *annual > *monthly:
		return billing.PlanPrice{}, invalid("annual_above_monthly", "The annual price is a monthly equivalent, so it can't be higher than the monthly price.")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return billing.PlanPrice{}, err
	}
	defer tx.Rollback(ctx)
	before, err := billing.Price(ctx, tx, plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return billing.PlanPrice{}, ErrNotFound
	}
	if err != nil {
		return billing.PlanPrice{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE plan_prices SET monthly_cents = $2, annual_cents = $3, updated_by = $4::uuid, updated_at = now() WHERE plan = $1`,
		plan, monthly, annual, actor.Admin.UserID); err != nil {
		return billing.PlanPrice{}, err
	}
	summary := func(m, a *int) map[string]any { return map[string]any{"monthlyCents": m, "annualCents": a} }
	if err := RecordAudit(ctx, tx, actor.target("plan", "plan.price", plan, reason, summary(before.MonthlyCents, before.AnnualCents), summary(monthly, annual))); err != nil {
		return billing.PlanPrice{}, err
	}
	after, err := billing.Price(ctx, tx, plan)
	if err != nil {
		return billing.PlanPrice{}, err
	}
	return after, tx.Commit(ctx)
}

// PlanRevenue is one paid plan: its list price and what its subscribers bring in.
type PlanRevenue struct {
	billing.PlanPrice
	UpdatedByName *string `json:"updatedByName"`
	// Active and past-due workspaces; trials and cancellations are counted separately.
	Workspaces int   `json:"workspaces"`
	Seats      int   `json:"seats"`
	MRRCents   int64 `json:"mrrCents"`
	Trialing   int   `json:"trialing"`
	// Paying workspaces whose price differs from today's list price for their billing cycle.
	OffListWorkspaces int `json:"offListWorkspaces"`
	// Paying workspaces with no agreed price; they count as $0.
	UnpricedWorkspaces int `json:"unpricedWorkspaces"`
}

// BillingEvent is something coming up on one subscription: a renewal, a trial or access ending, or a missed payment.
type BillingEvent struct {
	Kind          string     `json:"kind"` // renewal, trial_end, access_end or past_due
	WorkspaceID   string     `json:"workspaceId"`
	WorkspaceName string     `json:"workspaceName"`
	Plan          string     `json:"plan"`
	Seats         int        `json:"seats"`
	BillingCycle  *string    `json:"billingCycle"`
	Date          *time.Time `json:"date"`
	// What the next charge would be: seats × price, times 12 when billed annually. Nil without a price.
	AmountCents *int64 `json:"amountCents"`
}

type PriceChange struct {
	Plan       string    `json:"plan"`
	AdminName  *string   `json:"adminName"`
	Reason     *string   `json:"reason"`
	Before     PriceSet  `json:"before"`
	After      PriceSet  `json:"after"`
	OccurredAt time.Time `json:"occurredAt"`
}

type PriceSet struct {
	MonthlyCents *int `json:"monthlyCents"`
	AnnualCents  *int `json:"annualCents"`
}

// BillingOverview is estimated recurring revenue: each subscription's seats × its price. No payment
// provider is connected, so none of it is money actually collected.
type BillingOverview struct {
	Currency           string `json:"currency"`
	MRRCents           int64  `json:"mrrCents"`
	ARRCents           int64  `json:"arrCents"`
	PayingWorkspaces   int    `json:"payingWorkspaces"`
	PaidSeats          int    `json:"paidSeats"`
	FreeWorkspaces     int    `json:"freeWorkspaces"`
	AnnualMRRCents     int64  `json:"annualMrrCents"`
	MonthlyMRRCents    int64  `json:"monthlyMrrCents"`
	PastDueWorkspaces  int    `json:"pastDueWorkspaces"`
	PastDueMRRCents    int64  `json:"pastDueMrrCents"`
	TrialingWorkspaces int    `json:"trialingWorkspaces"`
	TrialMRRCents      int64  `json:"trialMrrCents"` // what trials would bring in at their price if they all converted
	// Extra MRR if every paying workspace moved to today's list price (negative when list prices fell).
	ListPriceDeltaCents int64          `json:"listPriceDeltaCents"`
	Plans               []PlanRevenue  `json:"plans"`
	Upcoming            []BillingEvent `json:"upcoming"`
	PriceChanges        []PriceChange  `json:"priceChanges"`
}

// Paying means active or past due: past-due workspaces still have access and are expected to pay.
const payingStatuses = `('active', 'past_due')`

func (s *Service) BillingOverview(ctx context.Context) (BillingOverview, error) {
	o := BillingOverview{Currency: "USD", Plans: []PlanRevenue{}, Upcoming: []BillingEvent{}, PriceChanges: []PriceChange{}}

	rows, err := s.db.Query(ctx, `
WITH subs AS (
  SELECT s.*, s.seats::bigint * COALESCE(s.seat_price_cents, 0) AS mrr,
    CASE WHEN s.billing_cycle = 'annual' THEN p.annual_cents ELSE p.monthly_cents END AS list_cents
  FROM organization_subscriptions s
  JOIN organizations o ON o.id = s.organization_id
  LEFT JOIN plan_prices p ON p.plan = s.plan
  WHERE s.plan <> 'free'
)
SELECT p.plan, p.monthly_cents, p.annual_cents, p.updated_at, u.name,
  count(s.*) FILTER (WHERE s.status IN `+payingStatuses+`),
  COALESCE(sum(s.seats) FILTER (WHERE s.status IN `+payingStatuses+`), 0),
  COALESCE(sum(s.mrr) FILTER (WHERE s.status IN `+payingStatuses+`), 0)::bigint,
  count(s.*) FILTER (WHERE s.status = 'trialing'),
  count(s.*) FILTER (WHERE s.status IN `+payingStatuses+` AND s.seat_price_cents IS NOT NULL AND s.seat_price_cents IS DISTINCT FROM s.list_cents),
  count(s.*) FILTER (WHERE s.status IN `+payingStatuses+` AND s.seat_price_cents IS NULL)
FROM plan_prices p
LEFT JOIN users u ON u.id = p.updated_by
LEFT JOIN subs s ON s.plan = p.plan
GROUP BY p.plan, p.monthly_cents, p.annual_cents, p.updated_at, u.name
ORDER BY array_position(ARRAY['starter', 'business', 'premium', 'enterprise'], p.plan)`)
	if err != nil {
		return o, err
	}
	for rows.Next() {
		var p PlanRevenue
		if err := rows.Scan(&p.Plan, &p.MonthlyCents, &p.AnnualCents, &p.UpdatedAt, &p.UpdatedByName,
			&p.Workspaces, &p.Seats, &p.MRRCents, &p.Trialing, &p.OffListWorkspaces, &p.UnpricedWorkspaces); err != nil {
			rows.Close()
			return o, err
		}
		o.Plans = append(o.Plans, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return o, err
	}

	if err := s.db.QueryRow(ctx, `
WITH subs AS (
  SELECT s.status, s.billing_cycle, s.seats, s.seats::bigint * COALESCE(s.seat_price_cents, 0) AS mrr,
    s.seats::bigint * COALESCE(CASE WHEN s.billing_cycle = 'annual' THEN p.annual_cents ELSE p.monthly_cents END, s.seat_price_cents, 0) AS list_mrr
  FROM organization_subscriptions s
  JOIN organizations o ON o.id = s.organization_id
  LEFT JOIN plan_prices p ON p.plan = s.plan
  WHERE s.plan <> 'free'
)
SELECT
  COALESCE(sum(mrr) FILTER (WHERE status IN `+payingStatuses+`), 0)::bigint,
  count(*) FILTER (WHERE status IN `+payingStatuses+`),
  COALESCE(sum(seats) FILTER (WHERE status IN `+payingStatuses+`), 0),
  COALESCE(sum(mrr) FILTER (WHERE status IN `+payingStatuses+` AND billing_cycle = 'annual'), 0)::bigint,
  COALESCE(sum(mrr) FILTER (WHERE status IN `+payingStatuses+` AND billing_cycle IS DISTINCT FROM 'annual'), 0)::bigint,
  count(*) FILTER (WHERE status = 'past_due'),
  COALESCE(sum(mrr) FILTER (WHERE status = 'past_due'), 0)::bigint,
  count(*) FILTER (WHERE status = 'trialing'),
  COALESCE(sum(mrr) FILTER (WHERE status = 'trialing'), 0)::bigint,
  COALESCE(sum(list_mrr - mrr) FILTER (WHERE status IN `+payingStatuses+`), 0)::bigint,
  (SELECT count(*) FROM organizations o LEFT JOIN organization_subscriptions s ON s.organization_id = o.id
   WHERE s.organization_id IS NULL OR s.plan = 'free')
FROM subs`).Scan(&o.MRRCents, &o.PayingWorkspaces, &o.PaidSeats, &o.AnnualMRRCents, &o.MonthlyMRRCents,
		&o.PastDueWorkspaces, &o.PastDueMRRCents, &o.TrialingWorkspaces, &o.TrialMRRCents, &o.ListPriceDeltaCents, &o.FreeWorkspaces); err != nil {
		return o, err
	}
	o.ARRCents = o.MRRCents * 12

	// Missed payments first, then everything dated in the next 30 days.
	rows, err = s.db.Query(ctx, `
SELECT kind, o.id::text, o.name, s.plan, s.seats, s.billing_cycle, s.period_ends_at,
  CASE WHEN s.seat_price_cents IS NULL THEN NULL
       ELSE s.seats::bigint * s.seat_price_cents * CASE WHEN s.billing_cycle = 'annual' THEN 12 ELSE 1 END END
FROM (
  SELECT organization_id, CASE status WHEN 'past_due' THEN 'past_due' WHEN 'trialing' THEN 'trial_end' WHEN 'canceled' THEN 'access_end' ELSE 'renewal' END AS kind
  FROM organization_subscriptions
  WHERE plan <> 'free'
    AND (status = 'past_due' OR (period_ends_at BETWEEN now() AND now() + interval '30 days'))
) e
JOIN organization_subscriptions s ON s.organization_id = e.organization_id
JOIN organizations o ON o.id = s.organization_id
ORDER BY e.kind <> 'past_due', s.period_ends_at NULLS LAST
LIMIT 50`)
	if err != nil {
		return o, err
	}
	for rows.Next() {
		var e BillingEvent
		if err := rows.Scan(&e.Kind, &e.WorkspaceID, &e.WorkspaceName, &e.Plan, &e.Seats, &e.BillingCycle, &e.Date, &e.AmountCents); err != nil {
			rows.Close()
			return o, err
		}
		o.Upcoming = append(o.Upcoming, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return o, err
	}

	rows, err = s.db.Query(ctx, `
SELECT a.target_id, u.name, a.reason,
  (a.before->>'monthlyCents')::int, (a.before->>'annualCents')::int,
  (a.after->>'monthlyCents')::int, (a.after->>'annualCents')::int, a.occurred_at
FROM admin_audit_events a
LEFT JOIN users u ON u.id = a.admin_user_id
WHERE a.action = 'plan.price'
ORDER BY a.occurred_at DESC
LIMIT 20`)
	if err != nil {
		return o, err
	}
	defer rows.Close()
	for rows.Next() {
		var c PriceChange
		if err := rows.Scan(&c.Plan, &c.AdminName, &c.Reason, &c.Before.MonthlyCents, &c.Before.AnnualCents, &c.After.MonthlyCents, &c.After.AnnualCents, &c.OccurredAt); err != nil {
			return o, err
		}
		o.PriceChanges = append(o.PriceChanges, c)
	}
	return o, rows.Err()
}
