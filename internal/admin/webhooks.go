package admin

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"signing-platform/internal/webhooks"
)

// WithWebhooks lets admins reprocess stored WorkOS events.
func (s *Service) WithWebhooks(processor *webhooks.Processor) *Service {
	s.webhooks = processor
	return s
}

// ---- WorkOS webhook events ----

type WebhookEvent struct {
	ID              string          `json:"id"`
	ProviderEventID string          `json:"providerEventId"`
	EventType       string          `json:"eventType"`
	State           string          `json:"state"` // processed, failed or pending
	Outcome         *string         `json:"outcome"`
	Error           *string         `json:"error"`
	ReceivedAt      time.Time       `json:"receivedAt"`
	ProcessedAt     *time.Time      `json:"processedAt"`
	Payload         json.RawMessage `json:"payload,omitempty"`
}

const webhookStateSQL = `CASE WHEN w.processed_at IS NOT NULL THEN 'processed' WHEN w.processing_error IS NOT NULL THEN 'failed' ELSE 'pending' END`

var webhookStates = map[string]bool{"processed": true, "failed": true, "pending": true}

// ListWebhookEvents searches by event type or WorkOS event ID. The payload is left out; open one to see it.
func (s *Service) ListWebhookEvents(ctx context.Context, query, state string, page Page) (List[WebhookEvent], error) {
	page = page.normalize()
	query = strings.TrimSpace(query)
	if !webhookStates[state] {
		state = ""
	}
	where := ` WHERE w.provider = 'workos' AND ($1 = '' OR w.id::text = $1 OR w.event_type ILIKE $2 OR w.provider_event_id = $1 OR w.payload::text ILIKE $2)
  AND ($3 = '' OR (` + webhookStateSQL + `) = $3)`
	args := []any{query, searchPattern(query), state}
	result := List[WebhookEvent]{Items: []WebhookEvent{}, Page: page.Number, PageSize: page.Size}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM auth_webhook_events w`+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	items, err := queryAll(ctx, s, `
SELECT w.id::text, w.provider_event_id, w.event_type, `+webhookStateSQL+`, w.outcome, w.processing_error, w.received_at, w.processed_at
FROM auth_webhook_events w`+where+` ORDER BY w.received_at DESC, w.id LIMIT $4 OFFSET $5`, append(args, page.Size, page.offset()),
		func(row pgx.Rows, v *WebhookEvent) error {
			return row.Scan(&v.ID, &v.ProviderEventID, &v.EventType, &v.State, &v.Outcome, &v.Error, &v.ReceivedAt, &v.ProcessedAt)
		})
	if err != nil {
		return result, err
	}
	result.Items = items
	return result, nil
}

func (s *Service) GetWebhookEvent(ctx context.Context, id string) (WebhookEvent, error) {
	if uuidOrNil(id) == nil {
		return WebhookEvent{}, ErrNotFound
	}
	var e WebhookEvent
	err := s.db.QueryRow(ctx, `
SELECT w.id::text, w.provider_event_id, w.event_type, `+webhookStateSQL+`, w.outcome, w.processing_error, w.received_at, w.processed_at, w.payload
FROM auth_webhook_events w WHERE w.id = $1::uuid`, id).
		Scan(&e.ID, &e.ProviderEventID, &e.EventType, &e.State, &e.Outcome, &e.Error, &e.ReceivedAt, &e.ProcessedAt, &e.Payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return WebhookEvent{}, ErrNotFound
	}
	return e, err
}

// ReprocessWebhookEvent applies a stored event again, e.g. after fixing the cause of an error.
func (s *Service) ReprocessWebhookEvent(ctx context.Context, actor Actor, id, reason string) (WebhookEvent, error) {
	if s.webhooks == nil {
		return WebhookEvent{}, errors.New("webhooks are not configured for the admin service")
	}
	reason, err := cleanReason(reason, false)
	if err != nil {
		return WebhookEvent{}, err
	}
	before, err := s.GetWebhookEvent(ctx, id)
	if err != nil {
		return WebhookEvent{}, err
	}
	// The error is saved on the event; the admin sees it in the returned state.
	_, _ = s.webhooks.Process(ctx, id)
	after, err := s.GetWebhookEvent(ctx, id)
	if err != nil {
		return WebhookEvent{}, err
	}
	event := actor.target("webhook", "webhook.reprocess", id, reason,
		map[string]any{"state": before.State, "eventType": before.EventType}, map[string]any{"state": after.State, "outcome": after.Outcome, "error": after.Error})
	if err := RecordAudit(ctx, s.db, event); err != nil {
		return WebhookEvent{}, err
	}
	return after, nil
}
