package envelope

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrNotFound = errors.New("envelope not found")
var ErrNotEditable = errors.New("envelope cannot be changed in its current status")

type RecipientSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	Status       string `json:"status"`
	SigningOrder int    `json:"signingOrder"`
}

type Envelope struct {
	ID                    string             `json:"id"`
	OrganizationID        string             `json:"organizationId"`
	CreatedBy             string             `json:"createdBy"`
	SenderName            *string            `json:"senderName,omitempty"`
	SenderEmail           *string            `json:"senderEmail,omitempty"`
	Title                 string             `json:"title"`
	Status                string             `json:"status"`
	Language              string             `json:"language"`
	Timezone              string             `json:"timezone"`
	DateFormat            string             `json:"dateFormat"`
	AllowedSignatureTypes string             `json:"allowedSignatureTypes"`
	DistributionMethod    string             `json:"distributionMethod"`
	ExternalID            *string            `json:"externalId,omitempty"`
	RedirectURL           *string            `json:"redirectUrl,omitempty"`
	EmailSubject          *string            `json:"emailSubject,omitempty"`
	EmailBody             *string            `json:"emailBody,omitempty"`
	FolderID              *string            `json:"folderId,omitempty"`
	AutoReminders         bool               `json:"autoReminders"`
	FirstReminderDays     int                `json:"firstReminderDays"`
	RepeatReminderDays    int                `json:"repeatReminderDays"`
	NotifyOnView          bool               `json:"notifyOnView"`
	NotifyOnSign          bool               `json:"notifyOnSign"`
	AttachCompletedPDF    bool               `json:"attachCompletedPdf"`
	SessionTimeoutMinutes int                `json:"sessionTimeoutMinutes"`
	RequirePasscode       bool               `json:"requirePasscode"`
	ExpiresAt             *time.Time         `json:"expiresAt,omitempty"`
	IsTemplate            bool               `json:"isTemplate"`
	CreatedAt             time.Time          `json:"createdAt"`
	UpdatedAt             time.Time          `json:"updatedAt"`
	Recipients            []RecipientSummary `json:"recipients,omitempty"`
}

type CreateInput struct {
	Title      string     `json:"title"`
	Language   string     `json:"language"`
	Timezone   string     `json:"timezone"`
	DateFormat string     `json:"dateFormat"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	IsTemplate bool       `json:"isTemplate"`
}

type UpdateInput struct {
	Title                 *string    `json:"title"`
	Language              *string    `json:"language"`
	Timezone              *string    `json:"timezone"`
	DateFormat            *string    `json:"dateFormat"`
	AllowedSignatureTypes *string    `json:"allowedSignatureTypes"`
	DistributionMethod    *string    `json:"distributionMethod"`
	ExternalID            *string    `json:"externalId"`
	RedirectURL           *string    `json:"redirectUrl"`
	EmailSubject          *string    `json:"emailSubject"`
	EmailBody             *string    `json:"emailBody"`
	AutoReminders         *bool      `json:"autoReminders"`
	FirstReminderDays     *int       `json:"firstReminderDays"`
	RepeatReminderDays    *int       `json:"repeatReminderDays"`
	NotifyOnView          *bool      `json:"notifyOnView"`
	NotifyOnSign          *bool      `json:"notifyOnSign"`
	AttachCompletedPDF    *bool      `json:"attachCompletedPdf"`
	SessionTimeoutMinutes *int       `json:"sessionTimeoutMinutes"`
	RequirePasscode       *bool      `json:"requirePasscode"`
	Passcode              *string    `json:"passcode"`
	ExpiresAt             *time.Time `json:"expiresAt"`
}

type ListFilter struct {
	Status     string
	FolderID   string // "" = all, "none" = unfiled, otherwise folder uuid
	IsTemplate *bool  // nil = documents only (default), pointer to true = templates only
}

type MoveFolderInput struct {
	FolderID *string `json:"folderId"`
}

type AuditEvent struct {
	ID            string          `json:"id"`
	EventType     string          `json:"eventType"`
	ActorName     *string         `json:"actorName,omitempty"`
	RecipientName *string         `json:"recipientName,omitempty"`
	IPAddress     *string         `json:"ipAddress,omitempty"`
	UserAgent     *string         `json:"userAgent,omitempty"`
	Metadata      json.RawMessage `json:"metadata"`
	OccurredAt    time.Time       `json:"occurredAt"`
}

type BulkMoveInput struct {
	EnvelopeIDs []string `json:"envelopeIds"`
	FolderID    *string  `json:"folderId"`
}

type BulkIDsInput struct {
	EnvelopeIDs []string `json:"envelopeIds"`
}

type Store interface {
	Create(context.Context, string, string, CreateInput) (Envelope, error)
	List(context.Context, string, ListFilter) ([]Envelope, error)
	Get(context.Context, string, string) (Envelope, error)
	Update(context.Context, string, string, UpdateInput) (Envelope, error)
	MoveToFolder(context.Context, string, string, *string) (Envelope, error)
	Delete(context.Context, string, string) error
	Void(context.Context, string, string, string) (Envelope, error)
	ListAudit(context.Context, string, string) ([]AuditEvent, error)
	BulkMoveToFolder(context.Context, string, []string, *string) (int64, error)
	BulkDelete(context.Context, string, []string) (int64, error)
	BulkVoid(context.Context, string, string, []string) (int64, error)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }

func (s *Service) BulkMoveToFolder(ctx context.Context, organizationID string, input BulkMoveInput) (int64, error) {
	if len(input.EnvelopeIDs) == 0 {
		return 0, errors.New("envelopeIds is required")
	}
	if input.FolderID != nil {
		trimmed := strings.TrimSpace(*input.FolderID)
		if trimmed == "" {
			input.FolderID = nil
		} else {
			input.FolderID = &trimmed
		}
	}
	return s.store.BulkMoveToFolder(ctx, organizationID, input.EnvelopeIDs, input.FolderID)
}

func (s *Service) BulkDelete(ctx context.Context, organizationID string, input BulkIDsInput) (int64, error) {
	if len(input.EnvelopeIDs) == 0 {
		return 0, errors.New("envelopeIds is required")
	}
	return s.store.BulkDelete(ctx, organizationID, input.EnvelopeIDs)
}

func (s *Service) BulkVoid(ctx context.Context, organizationID, userID string, input BulkIDsInput) (int64, error) {
	if len(input.EnvelopeIDs) == 0 {
		return 0, errors.New("envelopeIds is required")
	}
	return s.store.BulkVoid(ctx, organizationID, userID, input.EnvelopeIDs)
}

func (s *Service) Create(ctx context.Context, organizationID, userID string, input CreateInput) (Envelope, error) {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		return Envelope{}, errors.New("title is required")
	}
	if input.Language == "" {
		input.Language = "en"
	}
	if input.Timezone == "" {
		input.Timezone = "Etc/UTC"
	}
	if input.DateFormat == "" {
		input.DateFormat = "YYYY-MM-DD"
	}
	return s.store.Create(ctx, organizationID, userID, input)
}

func (s *Service) List(ctx context.Context, organizationID string, filter ListFilter) ([]Envelope, error) {
	allowed := map[string]bool{"": true, "draft": true, "in_progress": true, "completed": true, "voided": true, "expired": true}
	if !allowed[filter.Status] {
		return nil, errors.New("invalid status")
	}
	filter.FolderID = strings.TrimSpace(filter.FolderID)
	return s.store.List(ctx, organizationID, filter)
}

func (s *Service) Get(ctx context.Context, organizationID, id string) (Envelope, error) {
	if strings.TrimSpace(id) == "" {
		return Envelope{}, ErrNotFound
	}
	return s.store.Get(ctx, organizationID, id)
}

func normalizeOptionalText(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (s *Service) Update(ctx context.Context, organizationID, id string, input UpdateInput) (Envelope, error) {
	if input.Title != nil {
		title := strings.TrimSpace(*input.Title)
		if title == "" {
			return Envelope{}, errors.New("title is required")
		}
		input.Title = &title
	}
	if input.AllowedSignatureTypes != nil {
		sigType := strings.TrimSpace(strings.ToLower(*input.AllowedSignatureTypes))
		validSigTypes := map[string]bool{
			"type_draw_upload": true,
			"draw_only":        true,
			"type_draw":        true,
			"upload_only":      true,
		}
		if !validSigTypes[sigType] {
			sigType = "type_draw_upload"
		}
		input.AllowedSignatureTypes = &sigType
	}
	if input.DistributionMethod != nil {
		dist := strings.TrimSpace(strings.ToLower(*input.DistributionMethod))
		if dist != "none" {
			dist = "email"
		}
		input.DistributionMethod = &dist
	}
	input.EmailSubject = normalizeOptionalText(input.EmailSubject)
	input.EmailBody = normalizeOptionalText(input.EmailBody)
	input.ExternalID = normalizeOptionalText(input.ExternalID)
	input.RedirectURL = normalizeOptionalText(input.RedirectURL)
	input.Passcode = normalizeOptionalText(input.Passcode)
	return s.store.Update(ctx, organizationID, id, input)
}

func (s *Service) MoveToFolder(ctx context.Context, organizationID, id string, input MoveFolderInput) (Envelope, error) {
	if input.FolderID != nil {
		trimmed := strings.TrimSpace(*input.FolderID)
		if trimmed == "" {
			input.FolderID = nil
		} else {
			input.FolderID = &trimmed
		}
	}
	return s.store.MoveToFolder(ctx, organizationID, id, input.FolderID)
}

func (s *Service) Delete(ctx context.Context, organizationID, id string) error {
	return s.store.Delete(ctx, organizationID, id)
}

func (s *Service) Void(ctx context.Context, organizationID, userID, id string) (Envelope, error) {
	return s.store.Void(ctx, organizationID, userID, id)
}

func (s *Service) ListAudit(ctx context.Context, organizationID, id string) ([]AuditEvent, error) {
	if _, err := s.Get(ctx, organizationID, id); err != nil {
		return nil, err
	}
	return s.store.ListAudit(ctx, organizationID, id)
}
