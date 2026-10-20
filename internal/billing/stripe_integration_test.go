package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"signing-platform/internal/database"
	"signing-platform/internal/stripe"
)

// fakeStripe serves GET /v1/subscriptions/{id} from a map the test controls.
type fakeStripe struct {
	mu   sync.Mutex
	subs map[string]map[string]any
}

func (f *fakeStripe) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := strings.TrimPrefix(r.URL.Path, "/v1/subscriptions/")
	sub, ok := f.subs[id]
	if r.Method != http.MethodGet || !ok {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"message":"No such subscription"}}`))
		return
	}
	_ = json.NewEncoder(w).Encode(sub)
}

func (f *fakeStripe) set(id string, sub map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.subs[id] = sub
}

func subscription(id, org, plan, status string, seats int, unitAmount int64, interval string, cancelAtEnd bool, periodEnd time.Time) map[string]any {
	return map[string]any{
		"id": id, "customer": "cus_test", "status": status, "cancel_at_period_end": cancelAtEnd,
		"metadata": map[string]string{"organization_id": org, "plan": plan},
		"items": map[string]any{"data": []map[string]any{{
			"id": "si_" + id, "quantity": seats, "current_period_end": periodEnd.Unix(),
			"price": map[string]any{"unit_amount": unitAmount, "recurring": map[string]string{"interval": interval}},
		}}},
	}
}

func signed(payload, secret string) string {
	now := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.%s", now, payload)
	return fmt.Sprintf("t=%d,v1=%s", now, hex.EncodeToString(mac.Sum(nil)))
}

// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/billing -run Integration
func TestIntegrationStripeWebhooks(t *testing.T) {
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

	fake := &fakeStripe{subs: map[string]map[string]any{}}
	server := httptest.NewServer(fake)
	t.Cleanup(server.Close)
	const secret = "whsec_integration"
	s := &Stripe{db: pool, client: stripe.NewWithBaseURL("sk_test", server.URL), webhook: secret, webOrigin: "http://localhost:3000", logger: slog.Default()}

	suffix := time.Now().Format("150405.000000")
	var orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Stripe Test', $1) RETURNING id::text`, "stripe-test-"+suffix).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	var eventIDs []string
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stripe_events WHERE id = ANY($1)`, eventIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID)
	})

	deliver := func(eventType, object string) error {
		id := fmt.Sprintf("evt_%s_%d", suffix, len(eventIDs))
		eventIDs = append(eventIDs, id)
		payload := fmt.Sprintf(`{"id":%q,"type":%q,"data":{"object":%s}}`, id, eventType, object)
		return s.HandleWebhook(ctx, []byte(payload), signed(payload, secret))
	}
	load := func() Subscription {
		sub, err := Load(ctx, pool, orgID)
		if err != nil {
			t.Fatalf("load: %v", err)
		}
		return sub
	}
	periodEnd := time.Now().Add(30 * 24 * time.Hour).Truncate(time.Second)

	// A bad signature is refused and changes nothing.
	payload := `{"id":"evt_forged","type":"customer.subscription.updated","data":{"object":{"id":"sub_x"}}}`
	if err := s.HandleWebhook(ctx, []byte(payload), signed(payload, "whsec_wrong")); !errors.Is(err, stripe.ErrBadSignature) {
		t.Fatalf("forged event: got %v, want ErrBadSignature", err)
	}

	// Checkout completes: Business, 3 seats, annual at $18/seat/month ($216/seat/year).
	subA := "sub_a_" + suffix
	fake.set(subA, subscription(subA, orgID, "business", "active", 3, 21600, "year", false, periodEnd))
	if err := deliver("checkout.session.completed", fmt.Sprintf(`{"id":"cs_1","mode":"subscription","client_reference_id":%q,"subscription":%q}`, orgID, subA)); err != nil {
		t.Fatalf("checkout completed: %v", err)
	}
	sub := load()
	if sub.Plan != "business" || sub.Seats != 3 || sub.BillingCycle == nil || *sub.BillingCycle != "annual" || sub.Status != "active" || !sub.ManagedByStripe {
		t.Fatalf("after checkout: %+v", sub)
	}
	if sub.SeatPriceCents == nil || *sub.SeatPriceCents != 1800 {
		t.Fatalf("seat price = %v, want 1800", sub.SeatPriceCents)
	}
	if sub.PeriodEndsAt == nil || !sub.PeriodEndsAt.Equal(periodEnd) {
		t.Fatalf("period end = %v, want %v", sub.PeriodEndsAt, periodEnd)
	}

	// Redelivering the same event is a no-op even if Stripe's data changed since.
	fake.set(subA, subscription(subA, orgID, "premium", "active", 9, 4000, "month", false, periodEnd))
	eventIDs = append(eventIDs, eventIDs[0])
	first := eventIDs[0]
	payload = fmt.Sprintf(`{"id":%q,"type":"checkout.session.completed","data":{"object":{"mode":"subscription","client_reference_id":%q,"subscription":%q}}}`, first, orgID, subA)
	if err := s.HandleWebhook(ctx, []byte(payload), signed(payload, secret)); err != nil {
		t.Fatalf("redelivery: %v", err)
	}
	if load().Plan != "business" {
		t.Fatalf("redelivered event was processed again")
	}

	// A plan change arrives as subscription.updated: Premium, 9 seats, monthly.
	if err := deliver("customer.subscription.updated", fmt.Sprintf(`{"id":%q}`, subA)); err != nil {
		t.Fatalf("subscription updated: %v", err)
	}
	if sub = load(); sub.Plan != "premium" || sub.Seats != 9 || *sub.BillingCycle != "monthly" || *sub.SeatPriceCents != 4000 {
		t.Fatalf("after update: %+v", sub)
	}

	// A failed payment marks it past due (invoice events carry the subscription id).
	fake.set(subA, subscription(subA, orgID, "premium", "past_due", 9, 4000, "month", false, periodEnd))
	if err := deliver("invoice.payment_failed", fmt.Sprintf(`{"id":"in_1","subscription":%q}`, subA)); err != nil {
		t.Fatalf("payment failed: %v", err)
	}
	if sub = load(); sub.Status != "past_due" {
		t.Fatalf("after failed payment: status %q", sub.Status)
	}

	// The customer cancels: the plan keeps working until the period ends.
	fake.set(subA, subscription(subA, orgID, "premium", "active", 9, 4000, "month", true, periodEnd))
	if err := deliver("customer.subscription.updated", fmt.Sprintf(`{"id":%q}`, subA)); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if sub = load(); sub.Plan != "premium" || sub.Status != "canceled" || !sub.CancelAtPeriodEnd {
		t.Fatalf("after cancel: %+v", sub)
	}

	// The workspace buys again before the old subscription ends, then the old one's deletion arrives late.
	subB := "sub_b_" + suffix
	fake.set(subB, subscription(subB, orgID, "starter", "active", 1, 1200, "month", false, periodEnd))
	if err := deliver("customer.subscription.created", fmt.Sprintf(`{"id":%q}`, subB)); err != nil {
		t.Fatalf("second subscription: %v", err)
	}
	fake.set(subA, subscription(subA, orgID, "premium", "canceled", 9, 4000, "month", true, periodEnd))
	if err := deliver("customer.subscription.deleted", fmt.Sprintf(`{"id":%q}`, subA)); err != nil {
		t.Fatalf("old subscription deleted: %v", err)
	}
	if sub = load(); sub.Plan != "starter" || !sub.ManagedByStripe {
		t.Fatalf("a stale deletion downgraded the new subscription: %+v", sub)
	}

	// The current subscription ends: back to Free, no longer managed by Stripe.
	fake.set(subB, subscription(subB, orgID, "starter", "canceled", 1, 1200, "month", false, periodEnd))
	if err := deliver("customer.subscription.deleted", fmt.Sprintf(`{"id":%q}`, subB)); err != nil {
		t.Fatalf("subscription deleted: %v", err)
	}
	if sub = load(); sub.Plan != "free" || sub.ManagedByStripe || sub.SeatPriceCents != nil {
		t.Fatalf("after deletion: %+v", sub)
	}

	// A Stripe failure is recorded and returned, so Stripe retries.
	if err := deliver("customer.subscription.updated", `{"id":"sub_missing"}`); err == nil {
		t.Fatalf("missing subscription: want an error")
	}
	var recorded *string
	if err := pool.QueryRow(ctx, `SELECT error FROM stripe_events WHERE id = $1`, eventIDs[len(eventIDs)-1]).Scan(&recorded); err != nil || recorded == nil {
		t.Fatalf("failure not recorded: %v %v", recorded, err)
	}
}

func TestIntegrationCheckoutValidation(t *testing.T) {
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
	// No server: every case must be refused before Stripe is called.
	s := &Stripe{db: pool, client: stripe.NewWithBaseURL("sk_test", "http://127.0.0.1:1"), webOrigin: "http://localhost:3000", logger: slog.Default()}

	var orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Checkout Test', $1) RETURNING id::text`, "checkout-test-"+time.Now().Format("150405.000000")).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1::uuid`, orgID) })

	for name, input := range map[string]CheckoutInput{
		"free plan":     {Plan: "free", Cycle: "monthly", Seats: 1},
		"unknown plan":  {Plan: "gold", Cycle: "monthly", Seats: 1},
		"bad cycle":     {Plan: "business", Cycle: "weekly", Seats: 1},
		"no seats":      {Plan: "business", Cycle: "monthly", Seats: 0},
		"too many":      {Plan: "business", Cycle: "monthly", Seats: MaxOnlineSeats + 1},
		"contact sales": {Plan: "enterprise", Cycle: "annual", Seats: 2},
	} {
		var checkoutErr *CheckoutError
		if _, err := s.Checkout(ctx, orgID, "buyer@example.com", input); !errors.As(err, &checkoutErr) {
			t.Errorf("%s: got %v, want a CheckoutError", name, err)
		}
	}

	var nilStripe *Stripe
	if _, err := nilStripe.Checkout(ctx, orgID, "", CheckoutInput{Plan: "business", Cycle: "monthly", Seats: 1}); !errors.Is(err, ErrBillingUnavailable) {
		t.Errorf("unconfigured: got %v, want ErrBillingUnavailable", err)
	}
}
