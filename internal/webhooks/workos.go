// Package webhooks receives WorkOS events, stores each one once and applies the ones Signet cares about:
// profile changes (name, email, verification) and organization renames.
package webhooks

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SignatureHeader carries "t=<timestamp>, v1=<hex HMAC-SHA256 of "<timestamp>.<body>">".
const SignatureHeader = "WorkOS-Signature"

// Tolerance is how old a signed request may be, which limits replays.
const Tolerance = 5 * time.Minute

var (
	ErrSignature  = errors.New("invalid webhook signature")
	ErrUnreadable = errors.New("unreadable event")
)

// VerifySignature checks a WorkOS signature header against the raw body.
func VerifySignature(header string, body []byte, secret string, now time.Time) error {
	var timestamp, signature string
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signature = value
		}
	}
	if timestamp == "" || signature == "" || secret == "" {
		return ErrSignature
	}
	issued, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return ErrSignature
	}
	// WorkOS sends milliseconds; accept seconds too.
	issuedAt := time.UnixMilli(issued)
	if issued < 1e12 {
		issuedAt = time.Unix(issued, 0)
	}
	if age := now.Sub(issuedAt); age > Tolerance || age < -Tolerance {
		return fmt.Errorf("%w: timestamp outside tolerance", ErrSignature)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	expected := mac.Sum(nil)
	given, err := hex.DecodeString(signature)
	if err != nil || !hmac.Equal(expected, given) {
		return ErrSignature
	}
	return nil
}

// Event is the WorkOS webhook envelope.
type Event struct {
	ID        string          `json:"id"`
	Event     string          `json:"event"`
	Data      json.RawMessage `json:"data"`
	CreatedAt string          `json:"created_at"`
}

type Processor struct {
	db *pgxpool.Pool
}

func NewProcessor(db *pgxpool.Pool) *Processor { return &Processor{db: db} }

// Record stores an event once. duplicate is true when WorkOS re-delivered one already stored.
func (p *Processor) Record(ctx context.Context, body []byte) (id string, duplicate bool, err error) {
	var event Event
	if err := json.Unmarshal(body, &event); err != nil || event.ID == "" || event.Event == "" {
		return "", false, ErrUnreadable
	}
	err = p.db.QueryRow(ctx, `
INSERT INTO auth_webhook_events (provider, provider_event_id, event_type, payload)
VALUES ('workos', $1, $2, $3)
ON CONFLICT (provider, provider_event_id) DO NOTHING
RETURNING id::text`, event.ID, event.Event, body).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", true, nil
	}
	return id, false, err
}

// Process applies a stored event and saves the outcome (or error) on it. Running it again is safe.
func (p *Processor) Process(ctx context.Context, id string) (string, error) {
	var eventType string
	var payload []byte
	err := p.db.QueryRow(ctx, `SELECT event_type, payload FROM auth_webhook_events WHERE id = $1::uuid`, id).Scan(&eventType, &payload)
	if err != nil {
		return "", err
	}
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return "", p.finish(ctx, id, "", fmt.Errorf("unreadable payload: %w", err))
	}
	outcome, applyErr := p.apply(ctx, eventType, event.Data)
	return outcome, p.finish(ctx, id, outcome, applyErr)
}

func (p *Processor) finish(ctx context.Context, id, outcome string, applyErr error) error {
	var message *string
	if applyErr != nil {
		text := applyErr.Error()
		message = &text
	}
	if _, err := p.db.Exec(ctx, `
UPDATE auth_webhook_events SET processed_at = CASE WHEN $3::text IS NULL THEN now() END, outcome = NULLIF($2, ''), processing_error = $3
WHERE id = $1::uuid`, id, outcome, message); err != nil {
		return err
	}
	return applyErr
}

type workosUser struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	EmailVerified bool   `json:"email_verified"`
}

type workosOrganization struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (p *Processor) apply(ctx context.Context, eventType string, data json.RawMessage) (string, error) {
	switch eventType {
	case "user.updated":
		var user workosUser
		if err := json.Unmarshal(data, &user); err != nil || user.ID == "" {
			return "", fmt.Errorf("unreadable user")
		}
		return p.applyUser(ctx, user)
	case "user.deleted":
		var user workosUser
		_ = json.Unmarshal(data, &user)
		// Their documents and audit trails must outlive the login, so nothing is removed here.
		return "Deleted in WorkOS. Their Signet account and documents are kept; suspend it in the admin app if needed.", nil
	case "organization.updated":
		var org workosOrganization
		if err := json.Unmarshal(data, &org); err != nil || org.ID == "" {
			return "", fmt.Errorf("unreadable organization")
		}
		return p.applyOrganization(ctx, org)
	default:
		return "No action needed for this event type.", nil
	}
}

func (p *Processor) applyUser(ctx context.Context, user workosUser) (string, error) {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var userID, email, name string
	var verified bool
	err = tx.QueryRow(ctx, `
SELECT u.id::text, u.email, u.name, u.email_verified_at IS NOT NULL
FROM auth_identities i JOIN users u ON u.id = i.user_id
WHERE i.provider = 'workos' AND i.provider_subject = $1 FOR UPDATE OF u`, user.ID).Scan(&userID, &email, &name, &verified)
	if errors.Is(err, pgx.ErrNoRows) {
		return "This person hasn't used Signet yet, so there's nothing to update.", nil
	}
	if err != nil {
		return "", err
	}

	var changes []string
	newName := strings.TrimSpace(user.FirstName + " " + user.LastName)
	if newName != "" && newName != name {
		changes = append(changes, "name")
	} else {
		newName = name
	}
	newEmail := strings.ToLower(strings.TrimSpace(user.Email))
	if newEmail != "" && newEmail != email {
		changes = append(changes, "email")
	} else {
		newEmail = email
	}
	if user.EmailVerified && !verified {
		changes = append(changes, "email verification")
	}
	if len(changes) == 0 {
		return "Already up to date.", nil
	}
	_, err = tx.Exec(ctx, `
UPDATE users SET name = $2, email = $3,
  email_verified_at = CASE WHEN $4 THEN COALESCE(email_verified_at, now()) ELSE email_verified_at END,
  updated_at = now()
WHERE id = $1::uuid`, userID, newName, newEmail, user.EmailVerified)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return "", fmt.Errorf("can't change email to %s: another Signet account already uses it", newEmail)
	}
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `UPDATE auth_identities SET provider_email = $2, updated_at = now() WHERE provider = 'workos' AND provider_subject = $1`, user.ID, newEmail); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return fmt.Sprintf("Updated %s for %s.", strings.Join(changes, ", "), newEmail), nil
}

func (p *Processor) applyOrganization(ctx context.Context, org workosOrganization) (string, error) {
	name := strings.TrimSpace(org.Name)
	if name == "" {
		return "No name in the event.", nil
	}
	tag, err := p.db.Exec(ctx, `
UPDATE organizations o SET name = $2, updated_at = now()
FROM organization_auth_identities i
WHERE i.organization_id = o.id AND i.provider = 'workos' AND i.provider_subject = $1 AND o.name <> $2`, org.ID, name)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		return "No matching workspace to rename, or the name is already current.", nil
	}
	return fmt.Sprintf("Renamed the workspace to %s.", name), nil
}

// Handler receives WorkOS webhooks. It answers 200 once the event is stored, even if applying it fails,
// so WorkOS doesn't retry forever; failures show up in the admin app, where staff can reprocess them.
func Handler(secret string, processor *Processor, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if secret == "" {
			http.Error(w, "webhooks are not configured", http.StatusServiceUnavailable)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			http.Error(w, "unreadable body", http.StatusBadRequest)
			return
		}
		if err := VerifySignature(r.Header.Get(SignatureHeader), body, secret, time.Now()); err != nil {
			logger.Warn("rejected WorkOS webhook", "error", err)
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
		id, duplicate, err := processor.Record(r.Context(), body)
		if errors.Is(err, ErrUnreadable) {
			// Signed but malformed: retrying won't help.
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err != nil {
			logger.Error("store WorkOS webhook", "error", err)
			http.Error(w, "unable to store event", http.StatusInternalServerError)
			return
		}
		if !duplicate {
			if _, err := processor.Process(r.Context(), id); err != nil {
				logger.Error("process WorkOS webhook", "eventId", id, "error", err)
			}
		}
		w.WriteHeader(http.StatusOK)
	}
}
