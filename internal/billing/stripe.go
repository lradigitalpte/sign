package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/stripe"
)

// MaxOnlineSeats is the most seats a workspace can buy online; larger teams go through sales.
// It matches MAX_ONLINE_SEATS in the web app.
const MaxOnlineSeats = 10

var (
	ErrBillingUnavailable = errors.New("online payments aren't set up yet")
	ErrNoBillingAccount   = errors.New("this workspace doesn't pay online yet")
)

// CheckoutError is a reason a purchase can't go ahead, worded for the customer.
type CheckoutError struct{ Message string }

func (e *CheckoutError) Error() string { return e.Message }

// Stripe sells plans through Stripe Checkout and keeps organization_subscriptions in step with Stripe.
// Prices come from plan_prices at the moment of purchase, so staff change prices in one place.
type Stripe struct {
	db        *pgxpool.Pool
	client    *stripe.Client
	webhook   string
	webOrigin string
	logger    *slog.Logger
}

// NewStripe returns nil when no secret key is set; every method on a nil *Stripe reports ErrBillingUnavailable.
func NewStripe(db *pgxpool.Pool, secretKey, webhookSecret, webOrigin string, logger *slog.Logger) *Stripe {
	if strings.TrimSpace(secretKey) == "" {
		return nil
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Stripe{db: db, client: stripe.New(secretKey), webhook: webhookSecret, webOrigin: strings.TrimRight(webOrigin, "/"), logger: logger}
}

func (s *Stripe) Enabled() bool { return s != nil }

type CheckoutInput struct {
	Plan  string `json:"plan"`
	Cycle string `json:"cycle"`
	Seats int    `json:"seats"`
}

// CheckoutResult has the Stripe Checkout URL to send the customer to, or Updated when an existing
// subscription was changed in place (no payment page needed; Stripe prorates the difference).
type CheckoutResult struct {
	URL     string `json:"url,omitempty"`
	Updated bool   `json:"updated"`
}

type billingAccount struct {
	customerID     *string
	subscriptionID *string
}

func (s *Stripe) account(ctx context.Context, organizationID string) (billingAccount, error) {
	var a billingAccount
	err := s.db.QueryRow(ctx, `SELECT stripe_customer_id, stripe_subscription_id FROM organization_subscriptions WHERE organization_id = $1::uuid`, organizationID).
		Scan(&a.customerID, &a.subscriptionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return billingAccount{}, nil
	}
	return a, err
}

// Checkout buys a plan for the workspace, or changes the plan or seats of the subscription it already has.
func (s *Stripe) Checkout(ctx context.Context, organizationID, email string, input CheckoutInput) (CheckoutResult, error) {
	if s == nil {
		return CheckoutResult{}, ErrBillingUnavailable
	}
	if input.Cycle != "monthly" && input.Cycle != "annual" {
		return CheckoutResult{}, &CheckoutError{"Choose monthly or annual billing."}
	}
	if !ValidPlan(input.Plan) || input.Plan == "free" {
		return CheckoutResult{}, &CheckoutError{"Choose a paid plan."}
	}
	if input.Seats < 1 || input.Seats > MaxOnlineSeats {
		return CheckoutResult{}, &CheckoutError{fmt.Sprintf("Choose between 1 and %d seats. For more, contact sales.", MaxOnlineSeats)}
	}
	current, err := Load(ctx, s.db, organizationID)
	if err != nil {
		return CheckoutResult{}, err
	}
	if input.Seats < current.SeatsUsed {
		return CheckoutResult{}, &CheckoutError{fmt.Sprintf("%d members send documents in this workspace. Choose at least %d seats, or make some of them viewers first.", current.SeatsUsed, current.SeatsUsed)}
	}
	price, err := Price(ctx, s.db, input.Plan)
	if err != nil {
		return CheckoutResult{}, err
	}
	cycle := input.Cycle
	seatCents := price.Cycle(&cycle)
	if seatCents == nil {
		return CheckoutResult{}, &CheckoutError{"This plan is sold through our sales team. Contact sales to buy it."}
	}
	product, err := s.product(ctx, input.Plan)
	if err != nil {
		return CheckoutResult{}, err
	}
	// Annual plans are charged once a year for twelve months at the monthly-equivalent price.
	unitAmount, interval := int64(*seatCents), "month"
	if cycle == "annual" {
		unitAmount, interval = int64(*seatCents)*12, "year"
	}

	acct, err := s.account(ctx, organizationID)
	if err != nil {
		return CheckoutResult{}, err
	}
	if acct.subscriptionID != nil {
		return s.changeSubscription(ctx, organizationID, *acct.subscriptionID, input, product, unitAmount, interval)
	}

	form := url.Values{
		"mode":                                           {"subscription"},
		"client_reference_id":                            {organizationID},
		"line_items[0][quantity]":                        {strconv.Itoa(input.Seats)},
		"line_items[0][price_data][currency]":            {"usd"},
		"line_items[0][price_data][product]":             {product},
		"line_items[0][price_data][unit_amount]":         {strconv.FormatInt(unitAmount, 10)},
		"line_items[0][price_data][recurring][interval]": {interval},
		"metadata[organization_id]":                      {organizationID},
		"metadata[plan]":                                 {input.Plan},
		"subscription_data[metadata][organization_id]":   {organizationID},
		"subscription_data[metadata][plan]":              {input.Plan},
		"allow_promotion_codes":                          {"true"},
		"billing_address_collection":                     {"required"},
		"tax_id_collection[enabled]":                     {"true"},
		"success_url":                                    {s.webOrigin + "/settings/billing?checkout=success"},
		"cancel_url":                                     {fmt.Sprintf("%s/checkout/%s?cycle=%s&seats=%d&canceled=1", s.webOrigin, url.PathEscape(input.Plan), cycle, input.Seats)},
	}
	if acct.customerID != nil {
		form.Set("customer", *acct.customerID)
		form.Set("customer_update[name]", "auto")
		form.Set("customer_update[address]", "auto")
	} else if email != "" {
		form.Set("customer_email", email)
	}
	checkoutURL, err := s.client.CreateCheckoutSession(ctx, form)
	if err != nil {
		return CheckoutResult{}, err
	}
	return CheckoutResult{URL: checkoutURL}, nil
}

// changeSubscription moves an existing subscription to a new plan, cycle or seat count, prorated.
func (s *Stripe) changeSubscription(ctx context.Context, organizationID, subscriptionID string, input CheckoutInput, product string, unitAmount int64, interval string) (CheckoutResult, error) {
	sub, err := s.client.GetSubscription(ctx, subscriptionID)
	if err != nil {
		return CheckoutResult{}, err
	}
	if len(sub.Items.Data) == 0 {
		return CheckoutResult{}, fmt.Errorf("stripe subscription %s has no items", subscriptionID)
	}
	form := url.Values{
		"items[0][id]":                              {sub.Items.Data[0].ID},
		"items[0][quantity]":                        {strconv.Itoa(input.Seats)},
		"items[0][price_data][currency]":            {"usd"},
		"items[0][price_data][product]":             {product},
		"items[0][price_data][unit_amount]":         {strconv.FormatInt(unitAmount, 10)},
		"items[0][price_data][recurring][interval]": {interval},
		"proration_behavior":                        {"create_prorations"},
		"cancel_at_period_end":                      {"false"},
		"metadata[organization_id]":                 {organizationID},
		"metadata[plan]":                            {input.Plan},
	}
	updated, err := s.client.UpdateSubscription(ctx, subscriptionID, form)
	if err != nil {
		return CheckoutResult{}, err
	}
	if err := s.apply(ctx, updated, organizationID); err != nil {
		return CheckoutResult{}, err
	}
	return CheckoutResult{Updated: true}, nil
}

// product returns the plan's Stripe product, creating it the first time the plan is sold.
func (s *Stripe) product(ctx context.Context, plan string) (string, error) {
	var id *string
	if err := s.db.QueryRow(ctx, `SELECT stripe_product_id FROM plan_prices WHERE plan = $1`, plan).Scan(&id); err != nil {
		return "", err
	}
	if id != nil && *id != "" {
		return *id, nil
	}
	created, err := s.client.CreateProduct(ctx, "Signet "+strings.ToUpper(plan[:1])+plan[1:], map[string]string{"plan": plan})
	if err != nil {
		return "", err
	}
	// If two checkouts raced, keep whichever product was saved first.
	var saved string
	err = s.db.QueryRow(ctx, `UPDATE plan_prices SET stripe_product_id = COALESCE(stripe_product_id, $2) WHERE plan = $1 RETURNING stripe_product_id`, plan, created).Scan(&saved)
	return saved, err
}

// PortalURL opens Stripe's customer portal, where customers update their card, download invoices and cancel.
func (s *Stripe) PortalURL(ctx context.Context, organizationID string) (string, error) {
	if s == nil {
		return "", ErrBillingUnavailable
	}
	acct, err := s.account(ctx, organizationID)
	if err != nil {
		return "", err
	}
	if acct.customerID == nil {
		return "", ErrNoBillingAccount
	}
	return s.client.CreatePortalSession(ctx, *acct.customerID, s.webOrigin+"/settings/billing")
}

type PaymentCard struct {
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int    `json:"expMonth"`
	ExpYear  int    `json:"expYear"`
}

type InvoiceSummary struct {
	ID          string    `json:"id"`
	Number      string    `json:"number"`
	Status      string    `json:"status"`
	AmountCents int64     `json:"amountCents"`
	Currency    string    `json:"currency"`
	CreatedAt   time.Time `json:"createdAt"`
	URL         string    `json:"url"`
	PDFURL      string    `json:"pdfUrl"`
}

// Details is what the Billing page shows about payments.
type Details struct {
	Enabled       bool             `json:"enabled"`
	HasAccount    bool             `json:"hasAccount"`
	PaymentMethod *PaymentCard     `json:"paymentMethod"`
	Invoices      []InvoiceSummary `json:"invoices"`
}

func (s *Stripe) Details(ctx context.Context, organizationID string) (Details, error) {
	d := Details{Enabled: s != nil, Invoices: []InvoiceSummary{}}
	if s == nil {
		return d, nil
	}
	acct, err := s.account(ctx, organizationID)
	if err != nil || acct.customerID == nil {
		return d, err
	}
	d.HasAccount = true
	subscription := ""
	if acct.subscriptionID != nil {
		subscription = *acct.subscriptionID
	}
	method, err := s.client.DefaultPaymentMethod(ctx, *acct.customerID, subscription)
	if err != nil {
		return d, err
	}
	if method != nil && method.Card != nil {
		d.PaymentMethod = &PaymentCard{Brand: method.Card.Brand, Last4: method.Card.Last4, ExpMonth: method.Card.ExpMonth, ExpYear: method.Card.ExpYear}
	}
	invoices, err := s.client.ListInvoices(ctx, *acct.customerID, 24)
	if err != nil {
		return d, err
	}
	for _, inv := range invoices {
		if inv.Status == "draft" {
			continue
		}
		d.Invoices = append(d.Invoices, InvoiceSummary{ID: inv.ID, Number: inv.Number, Status: inv.Status, AmountCents: inv.Total, Currency: inv.Currency,
			CreatedAt: time.Unix(inv.Created, 0).UTC(), URL: inv.HostedInvoiceURL, PDFURL: inv.InvoicePDF})
	}
	return d, nil
}

// ---- Webhooks ----

// HandleWebhook verifies and processes one Stripe event. Each event is processed once; Stripe retries
// failures, and the subscription is always re-read from Stripe, so events arriving out of order are harmless.
func (s *Stripe) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
	if s == nil || s.webhook == "" {
		return ErrBillingUnavailable
	}
	event, err := stripe.VerifyWebhook(payload, signature, s.webhook, time.Now())
	if err != nil {
		return err
	}
	var processed bool
	if err := s.db.QueryRow(ctx, `
INSERT INTO stripe_events (id, type) VALUES ($1, $2)
ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
RETURNING processed_at IS NOT NULL`, event.ID, event.Type).Scan(&processed); err != nil {
		return err
	}
	if processed {
		return nil
	}
	handleErr := s.handle(ctx, event)
	var errText *string
	if handleErr != nil {
		text := handleErr.Error()
		errText = &text
		s.logger.Error("stripe webhook", "event", event.ID, "type", event.Type, "error", handleErr)
	}
	if _, err := s.db.Exec(ctx, `UPDATE stripe_events SET processed_at = CASE WHEN $2::text IS NULL THEN now() END, error = $2 WHERE id = $1`, event.ID, errText); err != nil {
		return err
	}
	return handleErr
}

func (s *Stripe) handle(ctx context.Context, event stripe.Event) error {
	var object struct {
		ID                string `json:"id"`
		Mode              string `json:"mode"`
		ClientReferenceID string `json:"client_reference_id"`
		Customer          string `json:"customer"`
		Subscription      string `json:"subscription"`
		// Newer API versions moved an invoice's subscription here.
		Parent struct {
			SubscriptionDetails struct {
				Subscription string `json:"subscription"`
			} `json:"subscription_details"`
		} `json:"parent"`
	}
	if err := json.Unmarshal(event.Data.Object, &object); err != nil {
		return fmt.Errorf("decode %s: %w", event.Type, err)
	}
	switch event.Type {
	case "checkout.session.completed":
		if object.Mode != "subscription" || object.Subscription == "" {
			return nil
		}
		return s.sync(ctx, object.Subscription, object.ClientReferenceID)
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
		"customer.subscription.paused", "customer.subscription.resumed":
		return s.sync(ctx, object.ID, "")
	case "invoice.paid", "invoice.payment_failed", "invoice.payment_succeeded":
		subscription := object.Subscription
		if subscription == "" {
			subscription = object.Parent.SubscriptionDetails.Subscription
		}
		if subscription == "" {
			return nil
		}
		return s.sync(ctx, subscription, "")
	default:
		return nil
	}
}

// sync re-reads a subscription from Stripe and saves it on its workspace.
func (s *Stripe) sync(ctx context.Context, subscriptionID, organizationHint string) error {
	sub, err := s.client.GetSubscription(ctx, subscriptionID)
	if err != nil {
		return err
	}
	return s.apply(ctx, sub, organizationHint)
}

func (s *Stripe) apply(ctx context.Context, sub stripe.Subscription, organizationHint string) error {
	organizationID := sub.Metadata["organization_id"]
	if organizationID == "" {
		organizationID = organizationHint
	}
	if organizationID == "" {
		if err := s.db.QueryRow(ctx, `SELECT organization_id::text FROM organization_subscriptions WHERE stripe_subscription_id = $1`, sub.ID).Scan(&organizationID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("subscription %s has no workspace", sub.ID)
			}
			return err
		}
	}

	switch sub.Status {
	case "incomplete":
		// The first payment hasn't gone through; nothing to activate yet.
		return nil
	case "canceled", "incomplete_expired":
		// The subscription is over: back to Free, unless the workspace has since moved to another subscription.
		_, err := s.db.Exec(ctx, `
UPDATE organization_subscriptions
SET plan = 'free', seats = 1, billing_cycle = NULL, status = 'active', period_ends_at = NULL, seat_price_cents = NULL,
    stripe_subscription_id = NULL, cancel_at_period_end = false, updated_by = NULL, updated_at = now()
WHERE organization_id = $1::uuid AND (stripe_subscription_id = $2 OR stripe_subscription_id IS NULL)`, organizationID, sub.ID)
		return err
	}

	plan := sub.Metadata["plan"]
	if !ValidPlan(plan) || plan == "free" {
		return fmt.Errorf("subscription %s has no valid plan in its metadata", sub.ID)
	}
	if len(sub.Items.Data) == 0 {
		return fmt.Errorf("subscription %s has no items", sub.ID)
	}
	item := sub.Items.Data[0]
	seats := max(item.Quantity, 1)
	cycle, seatCents := "monthly", item.Price.UnitAmount
	if item.Price.Recurring.Interval == "year" {
		cycle, seatCents = "annual", (item.Price.UnitAmount+6)/12
	}
	status := map[string]string{"active": "active", "trialing": "trialing", "past_due": "past_due", "unpaid": "past_due", "paused": "past_due"}[sub.Status]
	if status == "" {
		return fmt.Errorf("subscription %s has unknown status %q", sub.ID, sub.Status)
	}
	cancelAtEnd := sub.CancelAtPeriodEnd || sub.CancelAt > 0
	if cancelAtEnd && status == "active" {
		status = "canceled" // still working until the period ends
	}
	_, err := s.db.Exec(ctx, `
INSERT INTO organization_subscriptions (organization_id, plan, seats, billing_cycle, status, period_ends_at, seat_price_cents, stripe_customer_id, stripe_subscription_id, cancel_at_period_end)
VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (organization_id) DO UPDATE SET plan = EXCLUDED.plan, seats = EXCLUDED.seats, billing_cycle = EXCLUDED.billing_cycle,
  status = EXCLUDED.status, period_ends_at = EXCLUDED.period_ends_at, seat_price_cents = EXCLUDED.seat_price_cents,
  stripe_customer_id = EXCLUDED.stripe_customer_id, stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_by = NULL, updated_at = now()`,
		organizationID, plan, min(seats, 10000), cycle, status, sub.PeriodEnd(), seatCents, sub.Customer, sub.ID, cancelAtEnd)
	return err
}
