package admin

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/billing"
)

// ---- Plans ----

type SubscriptionInput struct {
	Plan         string     `json:"plan"`
	Seats        int        `json:"seats"`
	BillingCycle *string    `json:"billingCycle"`
	Status       string     `json:"status"`
	PeriodEndsAt *time.Time `json:"periodEndsAt"`
	// PriceMode is "keep" (the workspace's current price, when the plan and billing cycle don't change),
	// "list" (the plan's list price today) or "custom" (SeatPriceCents). Empty means "keep".
	PriceMode      string `json:"priceMode"`
	SeatPriceCents *int   `json:"seatPriceCents"`
	Note           string `json:"note"`
	Reason         string `json:"reason"`
}

// AdminSubscription adds the staff-only note to what the customer sees.
type AdminSubscription struct {
	billing.Subscription
	Note *string `json:"note"`
}

func (s *Service) subscription(ctx context.Context, workspaceID string) (AdminSubscription, error) {
	sub, err := billing.Load(ctx, s.db, workspaceID)
	if err != nil {
		return AdminSubscription{}, err
	}
	result := AdminSubscription{Subscription: sub}
	err = s.db.QueryRow(ctx, `SELECT note FROM organization_subscriptions WHERE organization_id = $1::uuid`, workspaceID).Scan(&result.Note)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return AdminSubscription{}, err
	}
	return result, nil
}

// SetSubscription puts a workspace on a plan by hand. Free clears billing details.
func (s *Service) SetSubscription(ctx context.Context, actor Actor, workspaceID string, input SubscriptionInput) (AdminSubscription, error) {
	reason, err := cleanReason(input.Reason, true)
	if err != nil {
		return AdminSubscription{}, err
	}
	input.Plan = strings.TrimSpace(input.Plan)
	if !billing.ValidPlan(input.Plan) {
		return AdminSubscription{}, invalid("invalid_plan", "Pick a plan.")
	}
	if input.Status == "" {
		input.Status = "active"
	}
	if !billing.ValidStatus(input.Status) {
		return AdminSubscription{}, invalid("invalid_status", "Pick trialing, active, past due or canceled.")
	}
	if input.Plan == "free" {
		input.Seats, input.BillingCycle, input.PeriodEndsAt, input.Status = 1, nil, nil, "active"
	} else {
		if input.Seats < 1 || input.Seats > 10000 {
			return AdminSubscription{}, invalid("invalid_seats", "Seats must be between 1 and 10,000.")
		}
		if input.BillingCycle != nil && *input.BillingCycle != "monthly" && *input.BillingCycle != "annual" {
			return AdminSubscription{}, invalid("invalid_cycle", "Billing cycle must be monthly or annual.")
		}
		if input.Status == "trialing" && input.PeriodEndsAt == nil {
			return AdminSubscription{}, invalid("trial_end_required", "Set when the trial ends.")
		}
	}
	note := strings.TrimSpace(input.Note)
	if len(note) > 500 {
		return AdminSubscription{}, invalid("note_too_long", "Keep the note under 500 characters.")
	}
	if uuidOrNil(workspaceID) == nil {
		return AdminSubscription{}, ErrNotFound
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return AdminSubscription{}, err
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM organizations WHERE id = $1::uuid)`, workspaceID).Scan(&exists); err != nil {
		return AdminSubscription{}, err
	}
	if !exists {
		return AdminSubscription{}, ErrNotFound
	}
	before, err := billing.Load(ctx, tx, workspaceID)
	if err != nil {
		return AdminSubscription{}, err
	}
	if before.ManagedByStripe {
		return AdminSubscription{}, invalid("stripe_managed", "This workspace pays through Stripe, so its plan follows Stripe. Change or cancel the subscription in the Stripe dashboard.")
	}
	seatPrice, err := subscriptionPrice(ctx, tx, before, input)
	if err != nil {
		return AdminSubscription{}, err
	}
	if _, err := tx.Exec(ctx, `
INSERT INTO organization_subscriptions (organization_id, plan, seats, billing_cycle, status, period_ends_at, seat_price_cents, note, updated_by)
VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9::uuid)
ON CONFLICT (organization_id) DO UPDATE SET plan = EXCLUDED.plan, seats = EXCLUDED.seats, billing_cycle = EXCLUDED.billing_cycle,
  status = EXCLUDED.status, period_ends_at = EXCLUDED.period_ends_at, seat_price_cents = EXCLUDED.seat_price_cents,
  note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`,
		workspaceID, input.Plan, input.Seats, input.BillingCycle, input.Status, input.PeriodEndsAt, seatPrice, note, actor.Admin.UserID); err != nil {
		return AdminSubscription{}, err
	}
	summary := func(plan string, seats int, cycle *string, status string, ends *time.Time, price *int) map[string]any {
		return map[string]any{"plan": plan, "seats": seats, "billingCycle": cycle, "status": status, "periodEndsAt": ends, "seatPriceCents": price}
	}
	event := actor.target("workspace", "workspace.plan", workspaceID, reason,
		summary(before.Plan, before.Seats, before.BillingCycle, before.Status, before.PeriodEndsAt, before.SeatPriceCents),
		summary(input.Plan, input.Seats, input.BillingCycle, input.Status, input.PeriodEndsAt, seatPrice))
	if err := RecordAudit(ctx, tx, event); err != nil {
		return AdminSubscription{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AdminSubscription{}, err
	}
	return s.subscription(ctx, workspaceID)
}

// maxSeatPriceCents caps a per-seat price at $100,000 a month, well above any real price, to catch typos.
const maxSeatPriceCents = 10_000_000

// subscriptionPrice works out what the workspace will pay per seat per month. Existing subscriptions keep
// their price until staff choose otherwise, so changing a list price never changes what anyone pays today.
func subscriptionPrice(ctx context.Context, tx pgx.Tx, before billing.Subscription, input SubscriptionInput) (*int, error) {
	if input.Plan == "free" {
		return nil, nil
	}
	switch input.PriceMode {
	case "custom":
		if input.SeatPriceCents == nil || *input.SeatPriceCents < 0 || *input.SeatPriceCents > maxSeatPriceCents {
			return nil, invalid("invalid_price", "Enter a price per seat between $0 and $100,000.")
		}
		return input.SeatPriceCents, nil
	case "", "keep", "list":
	default:
		return nil, invalid("invalid_price_mode", "Pick keep, list or custom pricing.")
	}
	unchanged := before.Plan == input.Plan && sameCycle(before.BillingCycle, input.BillingCycle)
	if input.PriceMode != "list" && unchanged && before.SeatPriceCents != nil {
		return before.SeatPriceCents, nil
	}
	list, err := billing.Price(ctx, tx, input.Plan)
	if err != nil {
		return nil, err
	}
	return list.Cycle(input.BillingCycle), nil
}

func sameCycle(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// ---- Usage ----

type WeekUsage struct {
	Week      string `json:"week"` // Monday of the week, UTC, YYYY-MM-DD
	Sent      int    `json:"sent"`
	Completed int    `json:"completed"`
}

type WorkspaceUsage struct {
	Weeks          []WeekUsage `json:"weeks"`
	SentThisMonth  int         `json:"sentThisMonth"`
	ActiveSenders  int         `json:"activeSenders"` // distinct people who sent in the last 30 days
	StorageBytes   int64       `json:"storageBytes"`  // uploaded documents, including drafts
	DocumentsCount int         `json:"documentsCount"`
}

const usageWeeks = 12

// GetWorkspaceUsage returns weekly sending activity for the last 12 weeks and current storage.
func (s *Service) GetWorkspaceUsage(ctx context.Context, workspaceID string) (WorkspaceUsage, error) {
	if uuidOrNil(workspaceID) == nil {
		return WorkspaceUsage{}, ErrNotFound
	}
	usage := WorkspaceUsage{Weeks: make([]WeekUsage, 0, usageWeeks)}
	rows, err := s.db.Query(ctx, `
WITH weeks AS (
  SELECT generate_series(date_trunc('week', now() AT TIME ZONE 'UTC') - make_interval(weeks => $2 - 1), date_trunc('week', now() AT TIME ZONE 'UTC'), interval '1 week')::date AS week
)
SELECT to_char(w.week, 'YYYY-MM-DD'),
  (SELECT count(*) FROM envelopes e WHERE e.organization_id = $1::uuid AND e.sent_at >= w.week AND e.sent_at < w.week + 7),
  (SELECT count(*) FROM envelopes e WHERE e.organization_id = $1::uuid AND e.completed_at >= w.week AND e.completed_at < w.week + 7)
FROM weeks w ORDER BY w.week`, workspaceID, usageWeeks)
	if err != nil {
		return usage, err
	}
	for rows.Next() {
		var week WeekUsage
		if err := rows.Scan(&week.Week, &week.Sent, &week.Completed); err != nil {
			rows.Close()
			return usage, err
		}
		usage.Weeks = append(usage.Weeks, week)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return usage, err
	}
	err = s.db.QueryRow(ctx, `
SELECT
  (SELECT count(*) FROM envelopes WHERE organization_id = $1::uuid AND sent_at >= date_trunc('month', now())),
  (SELECT count(DISTINCT created_by) FROM envelopes WHERE organization_id = $1::uuid AND sent_at > now() - interval '30 days'),
  (SELECT COALESCE(sum(d.size_bytes), 0) FROM documents d JOIN envelopes e ON e.id = d.envelope_id WHERE e.organization_id = $1::uuid),
  (SELECT count(*) FROM documents d JOIN envelopes e ON e.id = d.envelope_id WHERE e.organization_id = $1::uuid)`, workspaceID).
		Scan(&usage.SentThisMonth, &usage.ActiveSenders, &usage.StorageBytes, &usage.DocumentsCount)
	return usage, err
}
