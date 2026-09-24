package inbox

import (
	"context"
	"errors"
	"strings"
	"time"

	"signing-platform/internal/securetoken"
)

var ErrNotFound = errors.New("inbox item not found")

type Item struct {
	RecipientID string     `json:"recipientId"`
	EnvelopeID  string     `json:"envelopeId"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	Role        string     `json:"role"`
	SenderName  string     `json:"senderName"`
	CompanyName string     `json:"companyName"`
	FieldCount  int        `json:"fieldCount"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	AccessToken string     `json:"accessToken,omitempty"`
}

type Store interface {
	List(context.Context, string) ([]Item, error)
	IssueAccess(context.Context, string, string, []byte, time.Time) (string, error)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }

func (s *Service) List(ctx context.Context, email string) ([]Item, error) {
	return s.store.List(ctx, strings.ToLower(strings.TrimSpace(email)))
}

func (s *Service) Access(ctx context.Context, email, recipientID string) (string, error) {
	raw, hash, err := securetoken.Generate()
	if err != nil {
		return "", err
	}
	id, err := s.store.IssueAccess(ctx, strings.ToLower(strings.TrimSpace(email)), recipientID, hash, time.Now().UTC().Add(30*24*time.Hour))
	if err != nil {
		return "", err
	}
	if id == "" {
		return "", ErrNotFound
	}
	return raw, nil
}
