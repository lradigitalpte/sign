package field

import (
	"context"
	"errors"
	"strings"
	"time"
)

var ErrNotFound = errors.New("field not found or envelope is not editable")

type Field struct {
	ID          string    `json:"id"`
	DocumentID  string    `json:"documentId"`
	RecipientID string    `json:"recipientId"`
	Type        string    `json:"type"`
	Page        int       `json:"page"`
	X           float64   `json:"x"`
	Y           float64   `json:"y"`
	Width       float64   `json:"width"`
	Height      float64   `json:"height"`
	Label       *string   `json:"label,omitempty"`
	Required    bool      `json:"required"`
	Options     []string  `json:"options,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
type CreateInput struct {
	DocumentID  string   `json:"documentId"`
	RecipientID string   `json:"recipientId"`
	Type        string   `json:"type"`
	Page        int      `json:"page"`
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	Width       float64  `json:"width"`
	Height      float64  `json:"height"`
	Label       *string  `json:"label"`
	Required    *bool    `json:"required"`
	Options     []string `json:"options"`
}
type UpdateInput struct {
	RecipientID *string   `json:"recipientId"`
	Page        *int      `json:"page"`
	X           *float64  `json:"x"`
	Y           *float64  `json:"y"`
	Width       *float64  `json:"width"`
	Height      *float64  `json:"height"`
	Label       *string   `json:"label"`
	Required    *bool     `json:"required"`
	Options     *[]string `json:"options"`
}
type Store interface {
	List(context.Context, string, string) ([]Field, error)
	Create(context.Context, string, string, CreateInput, bool) (Field, error)
	Update(context.Context, string, string, string, UpdateInput) (Field, error)
	Delete(context.Context, string, string, string) error
}
type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func validType(value string) bool {
	switch value {
	case "signature", "initials", "name", "date", "text", "checkbox", "attachment", "dropdown", "radio":
		return true
	}
	return false
}
func requiresOptions(fieldType string) bool {
	return fieldType == "dropdown" || fieldType == "radio"
}
func cleanOptions(options []string) []string {
	trimmed := make([]string, 0, len(options))
	for _, option := range options {
		option = strings.TrimSpace(option)
		if option != "" {
			trimmed = append(trimmed, option)
		}
	}
	return trimmed
}
func validOptions(options []string) error {
	if len(cleanOptions(options)) < 2 {
		return errors.New("dropdown and multiple-choice fields need at least two options")
	}
	return nil
}
func validPlacement(page int, x, y, width, height float64) error {
	if page < 1 {
		return errors.New("page must be positive")
	}
	if x < 0 || y < 0 || width <= 0 || height <= 0 || x+width > 100 || y+height > 100 {
		return errors.New("field must fit within page bounds")
	}
	return nil
}
func (s *Service) List(ctx context.Context, org, envelopeID string) ([]Field, error) {
	return s.store.List(ctx, org, envelopeID)
}
func (s *Service) Create(ctx context.Context, org, envelopeID string, input CreateInput) (Field, error) {
	input.DocumentID = strings.TrimSpace(input.DocumentID)
	input.RecipientID = strings.TrimSpace(input.RecipientID)
	if input.DocumentID == "" || input.RecipientID == "" {
		return Field{}, errors.New("document and recipient are required")
	}
	if !validType(input.Type) {
		return Field{}, errors.New("invalid field type")
	}
	if err := validPlacement(input.Page, input.X, input.Y, input.Width, input.Height); err != nil {
		return Field{}, err
	}
	if requiresOptions(input.Type) {
		if err := validOptions(input.Options); err != nil {
			return Field{}, err
		}
		input.Options = cleanOptions(input.Options)
	} else {
		input.Options = nil
	}
	required := true
	if input.Required != nil {
		required = *input.Required
	}
	return s.store.Create(ctx, org, envelopeID, input, required)
}
func (s *Service) Update(ctx context.Context, org, envelopeID, id string, input UpdateInput) (Field, error) {
	if input.Page != nil && *input.Page < 1 {
		return Field{}, errors.New("page must be positive")
	}
	if input.X != nil && (*input.X < 0 || *input.X > 100) {
		return Field{}, errors.New("invalid x position")
	}
	if input.Y != nil && (*input.Y < 0 || *input.Y > 100) {
		return Field{}, errors.New("invalid y position")
	}
	if input.Width != nil && (*input.Width <= 0 || *input.Width > 100) {
		return Field{}, errors.New("invalid field width")
	}
	if input.Height != nil && (*input.Height <= 0 || *input.Height > 100) {
		return Field{}, errors.New("invalid field height")
	}
	if input.Options != nil {
		if err := validOptions(*input.Options); err != nil {
			return Field{}, err
		}
		cleaned := cleanOptions(*input.Options)
		input.Options = &cleaned
	}
	return s.store.Update(ctx, org, envelopeID, id, input)
}
func (s *Service) Delete(ctx context.Context, org, envelopeID, id string) error {
	return s.store.Delete(ctx, org, envelopeID, id)
}
