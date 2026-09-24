package send

import (
	"context"
	"errors"
	"strings"
)

var ErrNotFound = errors.New("draft envelope not found")
var ErrNotReady = errors.New("envelope is not ready to send")
var ErrAlreadySent = errors.New("envelope has already been sent")
var ErrIsTemplate = errors.New("templates cannot be sent directly; create an envelope from this template first")
var ErrIdempotencyKey = errors.New("Idempotency-Key header is required")
var ErrNotInProgress = errors.New("envelope is not in progress")
var ErrNothingToRemind = errors.New("no recipients are waiting to sign")

type ReviewDocument struct {
	ID         string `json:"id"`
	Filename   string `json:"filename"`
	PageCount  int    `json:"pageCount"`
	FieldCount int    `json:"fieldCount"`
}

type ReviewRecipient struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Email                 string `json:"email"`
	Role                  string `json:"role"`
	SigningOrder          int    `json:"signingOrder"`
	FieldCount            int    `json:"fieldCount"`
	RequiredFieldCount    int    `json:"requiredFieldCount"`
	Actionable            bool   `json:"actionable"`
	MissingRequiredFields bool   `json:"missingRequiredFields"`
}

type FieldCounts struct {
	Total    int            `json:"total"`
	Required int            `json:"required"`
	ByType   map[string]int `json:"byType"`
}

type Review struct {
	EnvelopeID  string            `json:"envelopeId"`
	Title       string            `json:"title"`
	Status      string            `json:"status"`
	Ready       bool              `json:"ready"`
	Errors      []string          `json:"errors"`
	Warnings    []string          `json:"warnings"`
	Documents   []ReviewDocument  `json:"documents"`
	Recipients  []ReviewRecipient `json:"recipients"`
	FieldCounts FieldCounts       `json:"fieldCounts"`
}

type Result struct {
	EnvelopeID        string `json:"envelopeId"`
	Status            string `json:"status"`
	InvitationsQueued int    `json:"invitationsQueued"`
	IdempotentReplay  bool   `json:"idempotentReplay"`
}

type RemindResult struct {
	EnvelopeID      string `json:"envelopeId"`
	RemindersQueued int    `json:"remindersQueued"`
}

type Token struct {
	Raw        string
	Hash       []byte
	Ciphertext []byte
}

type Store interface {
	Review(context.Context, string, string) (Review, error)
	Send(context.Context, string, string, string, string, func() (Token, error)) (Result, error)
	Advance(context.Context, string, func() (Token, error)) (int, error)
	Remind(context.Context, string, string, string, func() (Token, error)) (RemindResult, error)
	ShareLink(context.Context, string, string, string, func() (Token, error)) (string, error)
}

func (s *Service) ShareLink(ctx context.Context, org, envelopeID, recipientID string) (string, error) {
	return s.store.ShareLink(ctx, org, envelopeID, recipientID, s.token)
}

type Service struct {
	store Store
	token func() (Token, error)
}

func NewService(store Store, token func() (Token, error)) *Service {
	return &Service{store: store, token: token}
}

func (s *Service) Review(ctx context.Context, org, envelopeID string) (Review, error) {
	return s.store.Review(ctx, org, envelopeID)
}

func (s *Service) Send(ctx context.Context, org, userID, envelopeID, idempotencyKey string) (Result, error) {
	if strings.TrimSpace(idempotencyKey) == "" {
		return Result{}, ErrIdempotencyKey
	}
	return s.store.Send(ctx, org, userID, envelopeID, idempotencyKey, s.token)
}

func (s *Service) Remind(ctx context.Context, org, userID, envelopeID string) (RemindResult, error) {
	if strings.TrimSpace(envelopeID) == "" {
		return RemindResult{}, ErrNotFound
	}
	return s.store.Remind(ctx, org, userID, envelopeID, s.token)
}

func (s *Service) OnRecipientCompleted(ctx context.Context, envelopeID string) error {
	if strings.TrimSpace(envelopeID) == "" {
		return nil
	}
	_, err := s.store.Advance(ctx, envelopeID, s.token)
	return err
}
