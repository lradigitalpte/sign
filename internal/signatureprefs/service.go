package signatureprefs

import (
	"context"
	"encoding/json"
	"errors"

	"signing-platform/internal/securetoken"
)

const maxAppearanceBytes = 3 << 20

type Preferences struct {
	Signature json.RawMessage `json:"signature,omitempty"`
	Initials  json.RawMessage `json:"initials,omitempty"`
}

type Store interface {
	Get(context.Context, string) ([]byte, []byte, error)
	Put(context.Context, string, []byte, []byte) error
}

type Service struct {
	store     Store
	protector *securetoken.Protector
}

func NewService(store Store, protector *securetoken.Protector) *Service {
	return &Service{store: store, protector: protector}
}

func (s *Service) Get(ctx context.Context, userID string) (Preferences, error) {
	signature, initials, err := s.store.Get(ctx, userID)
	if err != nil {
		return Preferences{}, err
	}
	var result Preferences
	if len(signature) > 0 {
		plain, err := s.protector.Decrypt(signature)
		if err != nil {
			return Preferences{}, err
		}
		result.Signature = plain
	}
	if len(initials) > 0 {
		plain, err := s.protector.Decrypt(initials)
		if err != nil {
			return Preferences{}, err
		}
		result.Initials = plain
	}
	return result, nil
}

func (s *Service) Put(ctx context.Context, userID string, input Preferences) (Preferences, error) {
	if err := validate(input.Signature); err != nil {
		return Preferences{}, err
	}
	if err := validate(input.Initials); err != nil {
		return Preferences{}, err
	}
	var signature, initials []byte
	var err error
	if len(input.Signature) > 0 && string(input.Signature) != "null" {
		signature, err = s.protector.Encrypt(input.Signature)
		if err != nil {
			return Preferences{}, err
		}
	}
	if len(input.Initials) > 0 && string(input.Initials) != "null" {
		initials, err = s.protector.Encrypt(input.Initials)
		if err != nil {
			return Preferences{}, err
		}
	}
	if err := s.store.Put(ctx, userID, signature, initials); err != nil {
		return Preferences{}, err
	}
	return input, nil
}

func validate(value json.RawMessage) error {
	if len(value) == 0 || string(value) == "null" {
		return nil
	}
	if len(value) > maxAppearanceBytes || !json.Valid(value) {
		return errors.New("invalid or oversized signature appearance")
	}
	var payload struct {
		Text  string `json:"text"`
		Image string `json:"image"`
		Items []struct {
			Text  string `json:"text"`
			Image string `json:"image"`
		} `json:"items"`
	}
	if err := json.Unmarshal(value, &payload); err != nil || (payload.Text == "" && payload.Image == "") {
		return errors.New("signature text or image is required")
	}
	if len(payload.Items) > 12 {
		return errors.New("a maximum of 12 saved signatures is allowed")
	}
	for _, item := range payload.Items {
		if item.Text == "" && item.Image == "" {
			return errors.New("saved signature text or image is required")
		}
	}
	return nil
}
