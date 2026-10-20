package folder

import (
	"context"
	"errors"
	"strings"
	"time"
)

var ErrNotFound = errors.New("folder not found")
var ErrConflict = errors.New("a folder with that name already exists")
var ErrNotEmpty = errors.New("folder still contains envelopes")
var ErrInvalidTransfer = errors.New("cannot transfer a folder into itself")

type Folder struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organizationId"`
	Name           string    `json:"name"`
	CreatedBy      string    `json:"createdBy"`
	EnvelopeCount  int       `json:"envelopeCount"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type CreateInput struct {
	Name string `json:"name"`
}

type UpdateInput struct {
	Name string `json:"name"`
}

type TransferInput struct {
	ToFolderID *string `json:"toFolderId"`
}

type TransferResult struct {
	Moved int `json:"moved"`
}

type Store interface {
	List(context.Context, string) ([]Folder, error)
	Create(context.Context, string, string, string) (Folder, error)
	Update(context.Context, string, string, string) (Folder, error)
	Delete(context.Context, string, string) error
	TransferEnvelopes(context.Context, string, string, *string) (int, error)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }

func normalizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("folder name is required")
	}
	if len(name) > 120 {
		return "", errors.New("folder name must be 120 characters or fewer")
	}
	return name, nil
}

func (s *Service) List(ctx context.Context, teamID string) ([]Folder, error) {
	return s.store.List(ctx, teamID)
}

func (s *Service) Create(ctx context.Context, teamID, userID string, input CreateInput) (Folder, error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return Folder{}, err
	}
	return s.store.Create(ctx, teamID, userID, name)
}

func (s *Service) Update(ctx context.Context, teamID, id string, input UpdateInput) (Folder, error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return Folder{}, err
	}
	return s.store.Update(ctx, teamID, id, name)
}

func (s *Service) Delete(ctx context.Context, teamID, id string) error {
	return s.store.Delete(ctx, teamID, id)
}

func (s *Service) TransferEnvelopes(ctx context.Context, teamID, fromFolderID string, input TransferInput) (TransferResult, error) {
	fromFolderID = strings.TrimSpace(fromFolderID)
	if fromFolderID == "" {
		return TransferResult{}, ErrNotFound
	}
	var to *string
	if input.ToFolderID != nil {
		trimmed := strings.TrimSpace(*input.ToFolderID)
		if trimmed == "" {
			to = nil
		} else {
			if trimmed == fromFolderID {
				return TransferResult{}, ErrInvalidTransfer
			}
			to = &trimmed
		}
	}
	moved, err := s.store.TransferEnvelopes(ctx, teamID, fromFolderID, to)
	if err != nil {
		return TransferResult{}, err
	}
	return TransferResult{Moved: moved}, nil
}
