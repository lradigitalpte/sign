package admin

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"signing-platform/internal/billing"
	"signing-platform/internal/database"
)

// Puts a throwaway workspace on Business, changes Business's list price, and checks the workspace keeps
// its price until moved onto the list price. Restores the price and deletes everything afterwards.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationPlanPrices(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	s := NewService(pool)

	suffix := time.Now().Format("150405.000000")
	var userID, orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Prices Test') RETURNING id::text`, "prices-test-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Prices Test', $1) RETURNING id::text`, "prices-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	original, err := billing.Price(ctx, pool, "business")
	if err != nil {
		t.Fatalf("load business price: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `UPDATE plan_prices SET monthly_cents = $1, annual_cents = $2, updated_by = NULL, updated_at = $3 WHERE plan = 'business'`, original.MonthlyCents, original.AnnualCents, original.UpdatedAt)
		_, _ = pool.Exec(ctx, `DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid`, userID)
	})
	actor := Actor{Admin: Admin{UserID: userID, Role: RoleSuperAdmin}}
	annual := "annual"
	ends := time.Now().Add(10 * 24 * time.Hour)

	sub, err := s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 3, BillingCycle: &annual, Status: "active", PeriodEndsAt: &ends, Reason: "test"})
	if err != nil {
		t.Fatalf("set subscription: %v", err)
	}
	if sub.SeatPriceCents == nil || *sub.SeatPriceCents != *original.AnnualCents {
		t.Fatalf("new subscription price = %v, want the annual list price %d", sub.SeatPriceCents, *original.AnnualCents)
	}
	lockedPrice := *sub.SeatPriceCents

	// Bad prices are refused.
	for _, bad := range []PlanPriceInput{
		{MonthlyCents: ptr(1000), AnnualCents: ptr(2000), Reason: "test"},
		{MonthlyCents: ptr(1000), Reason: "test"},
		{Reason: "test"},
		{MonthlyCents: ptr(1000), AnnualCents: ptr(900)},
	} {
		var actionErr *ActionError
		if _, err := s.SetPlanPrice(ctx, actor, "business", bad); !errors.As(err, &actionErr) {
			t.Fatalf("SetPlanPrice(%+v) = %v, want a validation error", bad, err)
		}
	}

	newMonthly, newAnnual := *original.MonthlyCents+500, *original.AnnualCents+500
	price, err := s.SetPlanPrice(ctx, actor, "business", PlanPriceInput{MonthlyCents: &newMonthly, AnnualCents: &newAnnual, Reason: "test increase"})
	if err != nil {
		t.Fatalf("set price: %v", err)
	}
	if *price.AnnualCents != newAnnual {
		t.Fatalf("annual = %d, want %d", *price.AnnualCents, newAnnual)
	}

	// Saving the plan again without asking for the list price keeps the old price.
	sub, err = s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 4, BillingCycle: &annual, Status: "active", PeriodEndsAt: &ends, Reason: "add a seat"})
	if err != nil {
		t.Fatalf("update subscription: %v", err)
	}
	if *sub.SeatPriceCents != lockedPrice {
		t.Fatalf("kept price = %d, want %d", *sub.SeatPriceCents, lockedPrice)
	}

	overview, err := s.BillingOverview(ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	var business PlanRevenue
	for _, p := range overview.Plans {
		if p.Plan == "business" {
			business = p
		}
	}
	if business.Workspaces < 1 || business.OffListWorkspaces < 1 {
		t.Fatalf("business revenue = %+v, want our workspace counted as off list", business)
	}
	if overview.ListPriceDeltaCents < int64(4*500) {
		t.Fatalf("list price delta = %d, want at least %d", overview.ListPriceDeltaCents, 4*500)
	}
	if overview.ARRCents != overview.MRRCents*12 {
		t.Fatalf("ARR %d isn't 12 × MRR %d", overview.ARRCents, overview.MRRCents)
	}
	found := false
	for _, e := range overview.Upcoming {
		if e.WorkspaceID == orgID {
			found = true
			if e.Kind != "renewal" || e.AmountCents == nil || *e.AmountCents != int64(4*lockedPrice*12) {
				t.Fatalf("upcoming = %+v, want an annual renewal of %d", e, 4*lockedPrice*12)
			}
		}
	}
	if !found {
		t.Fatalf("renewal in 10 days missing from upcoming")
	}
	if len(overview.PriceChanges) == 0 || overview.PriceChanges[0].Plan != "business" || *overview.PriceChanges[0].After.AnnualCents != newAnnual {
		t.Fatalf("price changes = %+v", overview.PriceChanges)
	}

	// Moving onto the list price picks up the new price; a custom price is taken as given.
	sub, err = s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 4, BillingCycle: &annual, Status: "active", PriceMode: "list", Reason: "renewal"})
	if err != nil {
		t.Fatalf("move to list price: %v", err)
	}
	if *sub.SeatPriceCents != newAnnual {
		t.Fatalf("list price = %d, want %d", *sub.SeatPriceCents, newAnnual)
	}
	sub, err = s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 4, BillingCycle: &annual, Status: "active", PriceMode: "custom", SeatPriceCents: ptr(1234), Reason: "discount"})
	if err != nil {
		t.Fatalf("custom price: %v", err)
	}
	if *sub.SeatPriceCents != 1234 {
		t.Fatalf("custom price = %d, want 1234", *sub.SeatPriceCents)
	}
	// Changing the billing cycle re-prices at the list price for the new cycle.
	monthly := "monthly"
	sub, err = s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 4, BillingCycle: &monthly, Status: "active", Reason: "switch to monthly"})
	if err != nil {
		t.Fatalf("switch cycle: %v", err)
	}
	if *sub.SeatPriceCents != newMonthly {
		t.Fatalf("monthly price = %d, want %d", *sub.SeatPriceCents, newMonthly)
	}
}

func ptr(v int) *int { return &v }
