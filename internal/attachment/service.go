package attachment

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"signing-platform/internal/storage"
)

const MaxUploadSize int64 = 25 << 20

var ErrNotFound = errors.New("attachment not found or envelope is not editable")
var ErrInvalidFile = errors.New("unsupported attachment file type")

type Attachment struct {
	ID         string    `json:"id"`
	EnvelopeID string    `json:"envelopeId"`
	Kind       string    `json:"kind"`
	Label      string    `json:"label"`
	URL        *string   `json:"url,omitempty"`
	Filename   *string   `json:"filename,omitempty"`
	MimeType   *string   `json:"mimeType,omitempty"`
	SizeBytes  *int64    `json:"sizeBytes,omitempty"`
	SHA256     *string   `json:"sha256,omitempty"`
	Position   int       `json:"position"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type StoredAttachment struct {
	Attachment
	ObjectKey string
}

type CreateLinkInput struct {
	Label    string `json:"label"`
	URL      string `json:"url"`
	Position int    `json:"position"`
}

type UpdateInput struct {
	Label    *string `json:"label"`
	URL      *string `json:"url"`
	Position *int    `json:"position"`
}

type Store interface {
	List(context.Context, string, string) ([]Attachment, error)
	Get(context.Context, string, string, string) (StoredAttachment, error)
	CreateLink(context.Context, string, string, CreateLinkInput) (Attachment, error)
	CreateFile(context.Context, string, string, string, string, string, int64, string, string, int) (Attachment, error)
	Update(context.Context, string, string, string, UpdateInput) (Attachment, error)
	Delete(context.Context, string, string, string) (*string, error)
}

type Service struct {
	store   Store
	objects storage.Resolver
}

func NewService(store Store, objects storage.Resolver) *Service {
	return &Service{store: store, objects: objects}
}

var allowedMimeTypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"text/plain":      true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

func validURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Scheme != "http" && parsed.Scheme != "https" || parsed.Host == "" {
		return "", errors.New("attachment url must be a valid http or https link")
	}
	return raw, nil
}

func normalizeMimeType(filename, header string) string {
	header = strings.TrimSpace(strings.ToLower(header))
	if allowedMimeTypes[header] {
		return header
	}
	switch strings.ToLower(filepathExt(filename)) {
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".txt":
		return "text/plain"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	default:
		return header
	}
}

func filepathExt(name string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 {
		return name[idx:]
	}
	return ""
}

func (s *Service) List(ctx context.Context, org, envelopeID string) ([]Attachment, error) {
	return s.store.List(ctx, org, envelopeID)
}

func (s *Service) CreateLink(ctx context.Context, org, envelopeID string, input CreateLinkInput) (Attachment, error) {
	input.Label = strings.TrimSpace(input.Label)
	if input.Label == "" {
		return Attachment{}, errors.New("attachment label is required")
	}
	link, err := validURL(input.URL)
	if err != nil {
		return Attachment{}, err
	}
	input.URL = link
	if input.Position < 0 {
		return Attachment{}, errors.New("position cannot be negative")
	}
	return s.store.CreateLink(ctx, org, envelopeID, input)
}

func (s *Service) Upload(ctx context.Context, org, envelopeID, label, filename string, size int64, body io.Reader) (Attachment, error) {
	label = strings.TrimSpace(label)
	filename = strings.TrimSpace(filename)
	if label == "" {
		return Attachment{}, errors.New("attachment label is required")
	}
	if filename == "" {
		filename = "attachment"
	}
	if size <= 0 || size > MaxUploadSize {
		return Attachment{}, fmt.Errorf("attachment must be between 1 byte and %d bytes", MaxUploadSize)
	}
	limited := io.LimitReader(bufio.NewReader(body), MaxUploadSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return Attachment{}, err
	}
	if int64(len(data)) == 0 || int64(len(data)) > MaxUploadSize {
		return Attachment{}, fmt.Errorf("attachment must be between 1 byte and %d bytes", MaxUploadSize)
	}
	mimeType := normalizeMimeType(filename, "")
	if !allowedMimeTypes[mimeType] {
		return Attachment{}, ErrInvalidFile
	}
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	key := org + "/" + envelopeID + "/attachments/" + uuid.NewString() + filepathExt(filename)
	store, err := s.objects.For(ctx, org)
	if err != nil {
		return Attachment{}, err
	}
	if err := store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return Attachment{}, fmt.Errorf("store attachment: %w", err)
	}
	value, err := s.store.CreateFile(ctx, org, envelopeID, label, filename, mimeType, int64(len(data)), key, hash, 0)
	if err != nil {
		_ = store.Delete(ctx, key)
		return Attachment{}, err
	}
	return value, nil
}

func (s *Service) Download(ctx context.Context, org, envelopeID, attachmentID string) (StoredAttachment, io.ReadCloser, error) {
	value, err := s.store.Get(ctx, org, envelopeID, attachmentID)
	if err != nil {
		return StoredAttachment{}, nil, err
	}
	if value.Kind != "file" || value.ObjectKey == "" {
		return StoredAttachment{}, nil, ErrNotFound
	}
	store, err := s.objects.For(ctx, org)
	if err != nil {
		return StoredAttachment{}, nil, err
	}
	body, err := store.Get(ctx, value.ObjectKey)
	if err != nil {
		return StoredAttachment{}, nil, err
	}
	return value, body, nil
}

func (s *Service) Update(ctx context.Context, org, envelopeID, id string, input UpdateInput) (Attachment, error) {
	if input.Label != nil {
		label := strings.TrimSpace(*input.Label)
		if label == "" {
			return Attachment{}, errors.New("attachment label is required")
		}
		input.Label = &label
	}
	if input.URL != nil {
		link, err := validURL(*input.URL)
		if err != nil {
			return Attachment{}, err
		}
		input.URL = &link
	}
	if input.Position != nil && *input.Position < 0 {
		return Attachment{}, errors.New("position cannot be negative")
	}
	return s.store.Update(ctx, org, envelopeID, id, input)
}

func (s *Service) Delete(ctx context.Context, org, envelopeID, id string) error {
	objectKey, err := s.store.Delete(ctx, org, envelopeID, id)
	if err != nil {
		return err
	}
	if objectKey != nil && *objectKey != "" {
		if store, err := s.objects.For(ctx, org); err == nil {
			_ = store.Delete(ctx, *objectKey)
		}
	}
	return nil
}
