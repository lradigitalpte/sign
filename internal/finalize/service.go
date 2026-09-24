package finalize

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"signing-platform/internal/pdfutil"
	"signing-platform/internal/storage"
)

type appearance struct {
	DocumentID string
	Page       int
	X          float64
	Y          float64
	Width      float64
	Height     float64
	Type       string
	Value      json.RawMessage
	SignerName string
}

type storedDocument struct {
	ID                 string
	ObjectKey          string
	CompletedObjectKey string
}

type Store interface {
	EnvelopeCompleted(context.Context, string) (bool, error)
	Documents(context.Context, string) ([]storedDocument, error)
	Appearances(context.Context, string) ([]appearance, error)
	SaveCompleted(context.Context, string, string, string) error
}

type Service struct {
	store   Store
	objects storage.Resolver
}

func NewService(store Store, objects storage.Resolver) *Service {
	return &Service{store: store, objects: objects}
}

func (s *Service) Finalize(ctx context.Context, envelopeID string) error {
	ok, err := s.store.EnvelopeCompleted(ctx, envelopeID)
	if err != nil || !ok {
		return err
	}
	documents, err := s.store.Documents(ctx, envelopeID)
	if err != nil {
		return err
	}
	fields, err := s.store.Appearances(ctx, envelopeID)
	if err != nil {
		return err
	}
	byDocument := map[string][]pdfutil.Stamp{}
	for _, field := range fields {
		stamp := pdfutil.Stamp{
			Page:   field.Page,
			X:      field.X,
			Y:      field.Y,
			Width:  field.Width,
			Height: field.Height,
			Text:   appearanceText(field.Type, field.Value, field.SignerName),
			Image:  appearanceImage(field.Value),
		}
		if stamp.Text == "" && len(stamp.Image) == 0 {
			continue
		}
		byDocument[field.DocumentID] = append(byDocument[field.DocumentID], stamp)
	}
	for _, document := range documents {
		if !s.documentNeedsFinalize(ctx, document) {
			continue
		}
		if err := s.finalizeDocument(ctx, document, byDocument[document.ID]); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) EnsureDocument(ctx context.Context, envelopeID, documentID string) error {
	ok, err := s.store.EnvelopeCompleted(ctx, envelopeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("envelope is not completed")
	}
	documents, err := s.store.Documents(ctx, envelopeID)
	if err != nil {
		return err
	}
	var target *storedDocument
	for i := range documents {
		if documents[i].ID == documentID {
			target = &documents[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("document not found")
	}
	fields, err := s.store.Appearances(ctx, envelopeID)
	if err != nil {
		return err
	}
	stamps := []pdfutil.Stamp{}
	for _, field := range fields {
		if field.DocumentID != documentID {
			continue
		}
		stamp := pdfutil.Stamp{
			Page:   field.Page,
			X:      field.X,
			Y:      field.Y,
			Width:  field.Width,
			Height: field.Height,
			Text:   appearanceText(field.Type, field.Value, field.SignerName),
			Image:  appearanceImage(field.Value),
		}
		if stamp.Text == "" && len(stamp.Image) == 0 {
			continue
		}
		stamps = append(stamps, stamp)
	}
	return s.finalizeDocument(ctx, *target, stamps)
}

func (s *Service) documentNeedsFinalize(ctx context.Context, document storedDocument) bool {
	if document.CompletedObjectKey == "" {
		return true
	}
	store, err := s.objects.For(ctx, storage.OrganizationIDFromKey(document.CompletedObjectKey))
	if err != nil {
		return true
	}
	body, err := store.Get(ctx, document.CompletedObjectKey)
	if err != nil {
		return true
	}
	_ = body.Close()
	return false
}

func (s *Service) finalizeDocument(ctx context.Context, document storedDocument, stamps []pdfutil.Stamp) error {
	orgID := storage.OrganizationIDFromKey(document.ObjectKey)
	store, err := s.objects.For(ctx, orgID)
	if err != nil {
		return err
	}
	body, err := store.Get(ctx, document.ObjectKey)
	if err != nil {
		return fmt.Errorf("load original PDF: %w", err)
	}
	original, err := io.ReadAll(body)
	body.Close()
	if err != nil {
		return err
	}
	stamped, err := pdfutil.StampFields(original, stamps)
	if err != nil {
		return fmt.Errorf("stamp PDF: %w", err)
	}
	key := strings.TrimSuffix(document.ObjectKey, ".pdf") + "-completed-" + uuid.NewString() + ".pdf"
	sum := sha256.Sum256(stamped)
	hash := hex.EncodeToString(sum[:])
	if err := store.Put(ctx, key, bytes.NewReader(stamped), int64(len(stamped)), "application/pdf"); err != nil {
		return fmt.Errorf("store completed PDF: %w", err)
	}
	if err := s.store.SaveCompleted(ctx, document.ID, key, hash); err != nil {
		_ = store.Delete(ctx, key)
		return err
	}
	if document.CompletedObjectKey != "" && document.CompletedObjectKey != key {
		_ = store.Delete(ctx, document.CompletedObjectKey)
	}
	return nil
}

func appearanceText(fieldType string, value json.RawMessage, signerName string) string {
	var payload map[string]any
	if len(value) > 0 {
		_ = json.Unmarshal(value, &payload)
	}
	switch fieldType {
	case "checkbox":
		if checked, _ := payload["checked"].(bool); checked {
			return "X"
		}
		return ""
	case "date":
		if iso, _ := payload["iso"].(string); strings.TrimSpace(iso) != "" {
			return strings.TrimSpace(iso)
		}
	case "attachment":
		if filename, _ := payload["filename"].(string); strings.TrimSpace(filename) != "" {
			return "📎 " + strings.TrimSpace(filename)
		}
	}
	if text, _ := payload["text"].(string); strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(signerName)
}

func appearanceImage(value json.RawMessage) []byte {
	var payload map[string]any
	if len(value) == 0 {
		return nil
	}
	if err := json.Unmarshal(value, &payload); err != nil {
		return nil
	}
	raw, _ := payload["image"].(string)
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	comma := strings.Index(raw, ",")
	if comma < 0 || !strings.Contains(strings.ToLower(raw[:comma]), "base64") {
		return nil
	}
	data, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return nil
	}
	return data
}
