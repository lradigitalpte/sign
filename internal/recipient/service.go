package recipient

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"
)

var ErrNotFound = errors.New("recipient not found")
var ErrEnvelopeNotDraft = errors.New("recipients can only be changed while the envelope is a draft")

type Recipient struct {
	ID             string    `json:"id"`
	EnvelopeID     string    `json:"envelopeId"`
	UserID         *string   `json:"userId,omitempty"`
	Name           string    `json:"name"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	Status         string    `json:"status"`
	SigningOrder   int       `json:"signingOrder"`
	PrivateMessage *string   `json:"privateMessage,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}
type CreateInput struct {
	Name           string  `json:"name"`
	Email          string  `json:"email"`
	Role           string  `json:"role"`
	SigningOrder   int     `json:"signingOrder"`
	PrivateMessage *string `json:"privateMessage"`
}
type UpdateInput struct {
	Name           *string `json:"name"`
	Email          *string `json:"email"`
	Role           *string `json:"role"`
	SigningOrder   *int    `json:"signingOrder"`
	PrivateMessage *string `json:"privateMessage"`
}
type Store interface {
	List(context.Context, string, string) ([]Recipient, error)
	Create(context.Context, string, string, CreateInput) (Recipient, error)
	Update(context.Context, string, string, string, UpdateInput) (Recipient, error)
	Delete(context.Context, string, string, string) error
	IsTemplate(context.Context, string, string) (bool, error)
}
type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func validRole(role string) bool {
	return role == "signer" || role == "approver" || role == "viewer" || role == "cc"
}
func normalizeEmail(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value {
		return "", errors.New("valid recipient email is required")
	}
	return value, nil
}
func (s *Service) List(ctx context.Context, org, envelopeID string) ([]Recipient, error) {
	return s.store.List(ctx, org, envelopeID)
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

func (s *Service) Create(ctx context.Context, org, envelopeID string, input CreateInput) (Recipient, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return Recipient{}, errors.New("recipient name is required")
	}
	if strings.TrimSpace(input.Email) == "" {
		isTemplate, err := s.store.IsTemplate(ctx, org, envelopeID)
		if err != nil {
			return Recipient{}, err
		}
		if !isTemplate {
			return Recipient{}, errors.New("valid recipient email is required")
		}
		input.Email = ""
	} else {
		email, err := normalizeEmail(input.Email)
		if err != nil {
			return Recipient{}, err
		}
		input.Email = email
	}
	if input.Role == "" {
		input.Role = "signer"
	}
	if !validRole(input.Role) {
		return Recipient{}, errors.New("invalid recipient role")
	}
	if input.SigningOrder < 0 {
		return Recipient{}, errors.New("signing order cannot be negative")
	}
	input.PrivateMessage = normalizeOptionalText(input.PrivateMessage)
	return s.store.Create(ctx, org, envelopeID, input)
}
func (s *Service) Update(ctx context.Context, org, envelopeID, id string, input UpdateInput) (Recipient, error) {
	if input.Name != nil {
		v := strings.TrimSpace(*input.Name)
		if v == "" {
			return Recipient{}, errors.New("recipient name is required")
		}
		input.Name = &v
	}
	if input.Email != nil {
		if strings.TrimSpace(*input.Email) == "" {
			isTemplate, err := s.store.IsTemplate(ctx, org, envelopeID)
			if err != nil {
				return Recipient{}, err
			}
			if !isTemplate {
				return Recipient{}, errors.New("valid recipient email is required")
			}
			empty := ""
			input.Email = &empty
		} else {
			v, err := normalizeEmail(*input.Email)
			if err != nil {
				return Recipient{}, err
			}
			input.Email = &v
		}
	}
	if input.Role != nil && !validRole(*input.Role) {
		return Recipient{}, errors.New("invalid recipient role")
	}
	if input.SigningOrder != nil && *input.SigningOrder <= 0 {
		return Recipient{}, errors.New("signing order must be positive")
	}
	input.PrivateMessage = normalizeOptionalText(input.PrivateMessage)
	return s.store.Update(ctx, org, envelopeID, id, input)
}
func (s *Service) Delete(ctx context.Context, org, envelopeID, id string) error {
	return s.store.Delete(ctx, org, envelopeID, id)
}
