// Package billing holds each workspace's plan and the plans' list prices. Customers buy plans through
// Stripe (stripe.go), whose webhooks keep the plan here in step; Signet staff set prices, and plans for
// workspaces that don't pay online, in the admin app.
// Limits are enforced only where the plan-enforcement flag is on; see entitlements.go.
package billing

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Plans, cheapest first. "free" is every workspace without a subscription row.
var Plans = []string{"free", "starter", "business", "premium", "enterprise"}

var validPlans = map[string]bool{"free": true, "starter": true, "business": true, "premium": true, "enterprise": true}

func ValidPlan(plan string) bool { return validPlans[plan] }

var validStatuses = map[string]bool{"trialing": true, "active": true, "past_due": true, "canceled": true}

func ValidStatus(status string) bool { return validStatuses[status] }

type Subscription struct {
	Plan         string     `json:"plan"`
	Seats        int        `json:"seats"`
	BillingCycle *string    `json:"billingCycle"`
	Status       string     `json:"status"`
	PeriodEndsAt *time.Time `json:"periodEndsAt"`
	// SeatPriceCents is what the workspace pays per seat per month (the monthly equivalent on annual
	// billing), fixed when the plan was set. Nil on Free, or when no price has been agreed yet.
	SeatPriceCents *int `json:"seatPriceCents"`
	// ManagedByStripe is true while the workspace pays through a Stripe subscription; Stripe's webhooks
	// then own the plan, seats and status.
	ManagedByStripe bool `json:"managedByStripe"`
	// CancelAtPeriodEnd: the customer canceled and the plan ends at PeriodEndsAt.
	CancelAtPeriodEnd bool `json:"cancelAtPeriodEnd"`
	// SeatsUsed counts members who can send: everyone except viewers, who only read.
	SeatsUsed int        `json:"seatsUsed"`
	UpdatedAt *time.Time `json:"updatedAt"`
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type rowsQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// PlanPrice is a paid plan's list price in US cents per seat per month. AnnualCents is the monthly
// equivalent when billed yearly. Both are nil for "contact sales".
type PlanPrice struct {
	Plan         string    `json:"plan"`
	MonthlyCents *int      `json:"monthlyCents"`
	AnnualCents  *int      `json:"annualCents"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Cycle picks the price for a billing cycle; anything but "annual" is billed monthly.
func (p PlanPrice) Cycle(cycle *string) *int {
	if cycle != nil && *cycle == "annual" {
		return p.AnnualCents
	}
	return p.MonthlyCents
}

// Prices returns the paid plans' list prices, cheapest plan first.
func Prices(ctx context.Context, db rowsQuerier) ([]PlanPrice, error) {
	rows, err := db.Query(ctx, `
SELECT plan, monthly_cents, annual_cents, updated_at FROM plan_prices
ORDER BY array_position(ARRAY['starter', 'business', 'premium', 'enterprise'], plan)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	prices := []PlanPrice{}
	for rows.Next() {
		var p PlanPrice
		if err := rows.Scan(&p.Plan, &p.MonthlyCents, &p.AnnualCents, &p.UpdatedAt); err != nil {
			return nil, err
		}
		prices = append(prices, p)
	}
	return prices, rows.Err()
}

// Price returns one paid plan's list price.
func Price(ctx context.Context, db querier, plan string) (PlanPrice, error) {
	p := PlanPrice{Plan: plan}
	err := db.QueryRow(ctx, `SELECT monthly_cents, annual_cents, updated_at FROM plan_prices WHERE plan = $1`, plan).Scan(&p.MonthlyCents, &p.AnnualCents, &p.UpdatedAt)
	return p, err
}

// Load returns the workspace's subscription, or the Free plan when none has been set.
func Load(ctx context.Context, db querier, organizationID string) (Subscription, error) {
	s := Subscription{Plan: "free", Seats: 1, Status: "active"}
	err := db.QueryRow(ctx, `
SELECT s.plan, s.seats, s.billing_cycle, s.status, s.period_ends_at, s.seat_price_cents,
  s.stripe_subscription_id IS NOT NULL, s.cancel_at_period_end, s.updated_at
FROM organization_subscriptions s WHERE s.organization_id = $1::uuid`, organizationID).
		Scan(&s.Plan, &s.Seats, &s.BillingCycle, &s.Status, &s.PeriodEndsAt, &s.SeatPriceCents, &s.ManagedByStripe, &s.CancelAtPeriodEnd, &s.UpdatedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Subscription{}, err
	}
	err = db.QueryRow(ctx, `SELECT count(*) FROM organization_memberships WHERE organization_id = $1::uuid AND role <> 'viewer'`, organizationID).Scan(&s.SeatsUsed)
	return s, err
}
