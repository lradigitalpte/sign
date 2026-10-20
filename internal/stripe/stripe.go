// Package stripe is a small client for the parts of the Stripe API that billing uses: Checkout,
// the customer portal, subscriptions, products, invoices and webhook signatures. It talks to the REST
// API directly, so there's no SDK to keep up to date.
package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	key     string
	baseURL string
	http    *http.Client
}

func New(secretKey string) *Client {
	return NewWithBaseURL(secretKey, "https://api.stripe.com")
}

// NewWithBaseURL points the client somewhere other than api.stripe.com, such as a test server.
func NewWithBaseURL(secretKey, baseURL string) *Client {
	return &Client{key: secretKey, baseURL: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: 20 * time.Second}}
}

// Error is an error Stripe returned, with its message meant for people.
type Error struct {
	Status  int
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return fmt.Sprintf("stripe: %s (%d %s)", e.Message, e.Status, e.Code) }

func (c *Client) do(ctx context.Context, method, path string, form url.Values, out any) error {
	var body io.Reader
	if form != nil && method != http.MethodGet {
		body = strings.NewReader(form.Encode())
	}
	endpoint := c.baseURL + path
	if form != nil && method == http.MethodGet {
		endpoint += "?" + form.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		var wrapped struct {
			Error Error `json:"error"`
		}
		_ = json.Unmarshal(raw, &wrapped)
		wrapped.Error.Status = resp.StatusCode
		if wrapped.Error.Message == "" {
			wrapped.Error.Message = resp.Status
		}
		return &wrapped.Error
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// ---- Objects ----

type Price struct {
	ID         string `json:"id"`
	UnitAmount int64  `json:"unit_amount"`
	Currency   string `json:"currency"`
	Product    string `json:"product"`
	Recurring  struct {
		Interval string `json:"interval"` // month or year
	} `json:"recurring"`
}

type SubscriptionItem struct {
	ID       string `json:"id"`
	Quantity int    `json:"quantity"`
	Price    Price  `json:"price"`
	// Newer API versions keep the billing period on each item rather than the subscription.
	CurrentPeriodEnd int64 `json:"current_period_end"`
}

type Subscription struct {
	ID                string            `json:"id"`
	Customer          string            `json:"customer"`
	Status            string            `json:"status"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	CancelAt          int64             `json:"cancel_at"`
	CurrentPeriodEnd  int64             `json:"current_period_end"`
	TrialEnd          int64             `json:"trial_end"`
	Metadata          map[string]string `json:"metadata"`
	Items             struct {
		Data []SubscriptionItem `json:"data"`
	} `json:"items"`
}

// PeriodEnd is when the current paid period (or trial) ends, whichever field this API version uses.
func (s Subscription) PeriodEnd() *time.Time {
	end := s.CurrentPeriodEnd
	if end == 0 && len(s.Items.Data) > 0 {
		end = s.Items.Data[0].CurrentPeriodEnd
	}
	if s.Status == "trialing" && s.TrialEnd > 0 {
		end = s.TrialEnd
	}
	if end == 0 {
		return nil
	}
	t := time.Unix(end, 0).UTC()
	return &t
}

type Card struct {
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int    `json:"exp_month"`
	ExpYear  int    `json:"exp_year"`
}

type PaymentMethod struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Card *Card  `json:"card"`
}

type Invoice struct {
	ID               string `json:"id"`
	Number           string `json:"number"`
	Status           string `json:"status"`
	Total            int64  `json:"total"`
	AmountDue        int64  `json:"amount_due"`
	Currency         string `json:"currency"`
	Created          int64  `json:"created"`
	HostedInvoiceURL string `json:"hosted_invoice_url"`
	InvoicePDF       string `json:"invoice_pdf"`
}

// ---- Calls ----

func (c *Client) CreateProduct(ctx context.Context, name string, metadata map[string]string) (string, error) {
	form := url.Values{"name": {name}}
	for k, v := range metadata {
		form.Set("metadata["+k+"]", v)
	}
	var product struct {
		ID string `json:"id"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/products", form, &product)
	return product.ID, err
}

// CreateCheckoutSession starts a hosted Checkout page and returns its URL.
func (c *Client) CreateCheckoutSession(ctx context.Context, form url.Values) (string, error) {
	var session struct {
		URL string `json:"url"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/checkout/sessions", form, &session)
	return session.URL, err
}

// CreatePortalSession opens the customer portal, where customers manage cards, invoices and cancellation.
func (c *Client) CreatePortalSession(ctx context.Context, customer, returnURL string) (string, error) {
	var session struct {
		URL string `json:"url"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/billing_portal/sessions", url.Values{"customer": {customer}, "return_url": {returnURL}}, &session)
	return session.URL, err
}

func (c *Client) GetSubscription(ctx context.Context, id string) (Subscription, error) {
	var sub Subscription
	err := c.do(ctx, http.MethodGet, "/v1/subscriptions/"+url.PathEscape(id), nil, &sub)
	return sub, err
}

func (c *Client) UpdateSubscription(ctx context.Context, id string, form url.Values) (Subscription, error) {
	var sub Subscription
	err := c.do(ctx, http.MethodPost, "/v1/subscriptions/"+url.PathEscape(id), form, &sub)
	return sub, err
}

// DefaultPaymentMethod is the card the subscription charges, falling back to the customer's default.
func (c *Client) DefaultPaymentMethod(ctx context.Context, customer, subscription string) (*PaymentMethod, error) {
	if subscription != "" {
		var sub struct {
			DefaultPaymentMethod *PaymentMethod `json:"default_payment_method"`
		}
		if err := c.do(ctx, http.MethodGet, "/v1/subscriptions/"+url.PathEscape(subscription), url.Values{"expand[]": {"default_payment_method"}}, &sub); err != nil {
			return nil, err
		}
		if sub.DefaultPaymentMethod != nil {
			return sub.DefaultPaymentMethod, nil
		}
	}
	var cust struct {
		InvoiceSettings struct {
			DefaultPaymentMethod *PaymentMethod `json:"default_payment_method"`
		} `json:"invoice_settings"`
	}
	if err := c.do(ctx, http.MethodGet, "/v1/customers/"+url.PathEscape(customer), url.Values{"expand[]": {"invoice_settings.default_payment_method"}}, &cust); err != nil {
		return nil, err
	}
	return cust.InvoiceSettings.DefaultPaymentMethod, nil
}

func (c *Client) ListInvoices(ctx context.Context, customer string, limit int) ([]Invoice, error) {
	var list struct {
		Data []Invoice `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/invoices", url.Values{"customer": {customer}, "limit": {strconv.Itoa(limit)}}, &list)
	return list.Data, err
}

// ---- Webhooks ----

type Event struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

var ErrBadSignature = errors.New("stripe: webhook signature doesn't match")

// signatureTolerance rejects events signed more than five minutes ago, so a captured request can't be replayed later.
const signatureTolerance = 5 * time.Minute

// VerifyWebhook checks the Stripe-Signature header against the endpoint's signing secret and decodes the event.
func VerifyWebhook(payload []byte, header, secret string, now time.Time) (Event, error) {
	var timestamp string
	var signatures []string
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signatures = append(signatures, value)
		}
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || len(signatures) == 0 {
		return Event{}, ErrBadSignature
	}
	if age := now.Sub(time.Unix(seconds, 0)); age > signatureTolerance || age < -signatureTolerance {
		return Event{}, ErrBadSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(payload)
	expected := mac.Sum(nil)
	valid := false
	for _, signature := range signatures {
		if got, err := hex.DecodeString(signature); err == nil && hmac.Equal(got, expected) {
			valid = true
		}
	}
	if !valid {
		return Event{}, ErrBadSignature
	}
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return Event{}, fmt.Errorf("stripe: decode event: %w", err)
	}
	return event, nil
}
