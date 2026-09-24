package signing

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"signing-platform/internal/storage"
)

var ErrInvalidToken = errors.New("signing token is invalid")
var ErrUnavailable = errors.New("this signing session is no longer available")
var ErrNotReady = errors.New("required fields are incomplete")
var ErrAlreadyFinished = errors.New("this recipient has already finished")

type Envelope struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Status    string     `json:"status"`
	Language  string     `json:"language"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

type Recipient struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Email          string  `json:"email"`
	Role           string  `json:"role"`
	Status         string  `json:"status"`
	PrivateMessage *string `json:"privateMessage,omitempty"`
}

type Attachment struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	Label    string  `json:"label"`
	URL      *string `json:"url,omitempty"`
	Filename *string `json:"filename,omitempty"`
	MimeType *string `json:"mimeType,omitempty"`
	Position int     `json:"position"`
}

type Document struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	PageCount int    `json:"pageCount"`
}

type FieldPlacement struct {
	Page   *int     `json:"page,omitempty"`
	X      *float64 `json:"x,omitempty"`
	Y      *float64 `json:"y,omitempty"`
	Width  *float64 `json:"width,omitempty"`
	Height *float64 `json:"height,omitempty"`
}

type FieldGeometry struct {
	Page   int     `json:"page"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Field struct {
	ID          string          `json:"id"`
	DocumentID  string          `json:"documentId"`
	RecipientID string          `json:"recipientId"`
	Type        string          `json:"type"`
	Page        int             `json:"page"`
	X           float64         `json:"x"`
	Y           float64         `json:"y"`
	Width       float64         `json:"width"`
	Height      float64         `json:"height"`
	Label       *string         `json:"label,omitempty"`
	Required    bool            `json:"required"`
	Options     []string        `json:"options,omitempty"`
	Value       json.RawMessage `json:"value,omitempty"`
	Completed   bool            `json:"completed"`
}

type Branding struct {
	LogoDataURL          string `json:"logoDataUrl,omitempty"`
	BrandName            string `json:"brandName,omitempty"`
	PrimaryColor         string `json:"primaryColor,omitempty"`
	HidePlatformBranding bool   `json:"hidePlatformBranding,omitempty"`
}

type Session struct {
	OrganizationName  string       `json:"organizationName"`
	OrganizationBrand Branding     `json:"organizationBrand"`
	Envelope          Envelope     `json:"envelope"`
	Recipient         Recipient    `json:"recipient"`
	Documents         []Document   `json:"documents"`
	Fields            []Field      `json:"fields"`
	Attachments       []Attachment `json:"attachments"`
	RemainingRequired int          `json:"remainingRequired"`
	CanAct            bool         `json:"canAct"`
}

type StoredDocument struct {
	ID        string
	Filename  string
	ObjectKey string
}

type AuditContext struct {
	IP        string
	UserAgent string
}

type FieldCreateInput struct {
	DocumentID string  `json:"documentId"`
	Type       string  `json:"type"`
	Page       int     `json:"page"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	Label      string  `json:"label"`
}

type Store interface {
	Resolve(context.Context, []byte) (Session, error)
	MarkViewed(context.Context, string, AuditContext) error
	SaveField(context.Context, string, string, json.RawMessage, *FieldPlacement) (Field, error)
	UpdateFieldPlacement(context.Context, string, string, FieldGeometry) (Field, error)
	CreateField(context.Context, string, FieldCreateInput) (Field, error)
	DeleteField(context.Context, string, string) error
	Complete(context.Context, string, AuditContext) error
	Decline(context.Context, string, string, AuditContext) error
	Document(context.Context, string, string) (StoredDocument, error)
	AttachmentFile(context.Context, string, string) (string, string, string, error)
	FieldContext(context.Context, string, string) (string, string, string, error)
}

type Finalizer interface {
	Finalize(context.Context, string) error
}

type Completer interface {
	OnRecipientCompleted(context.Context, string) error
}

type Service struct {
	store     Store
	objects   storage.Resolver
	finalizer Finalizer
	completer Completer
}

func NewService(store Store, objects storage.Resolver) *Service {
	return &Service{store: store, objects: objects}
}

func (s *Service) WithFinalizer(finalizer Finalizer) *Service {
	s.finalizer = finalizer
	return s
}

func (s *Service) WithCompleter(completer Completer) *Service {
	s.completer = completer
	return s
}

func (s *Service) Session(ctx context.Context, tokenHash []byte) (Session, error) {
	session, err := s.store.Resolve(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	session.RemainingRequired = remainingRequired(session.Fields, session.Recipient.ID)
	session.CanAct = session.Envelope.Status == "in_progress" && (session.Recipient.Status == "sent" || session.Recipient.Status == "viewed")
	return session, nil
}

func (s *Service) View(ctx context.Context, tokenHash []byte, audit AuditContext) (Session, error) {
	session, err := s.Session(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if session.CanAct {
		if err := s.store.MarkViewed(ctx, session.Recipient.ID, audit); err != nil {
			return Session{}, err
		}
		session.Recipient.Status = "viewed"
	}
	return session, nil
}

func (s *Service) SaveField(ctx context.Context, tokenHash []byte, fieldID string, value json.RawMessage, placement *FieldPlacement) (Field, Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Field{}, Session{}, err
	}
	if len(value) == 0 || string(value) == "null" {
		return Field{}, Session{}, errors.New("field value is required")
	}
	field, err := s.store.SaveField(ctx, session.Recipient.ID, fieldID, value, placement)
	if err != nil {
		return Field{}, Session{}, err
	}
	session, err = s.Session(ctx, tokenHash)
	return field, session, err
}

func (s *Service) UpdateFieldPlacement(ctx context.Context, tokenHash []byte, fieldID string, placement FieldGeometry) (Field, Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Field{}, Session{}, err
	}
	field, err := s.store.UpdateFieldPlacement(ctx, session.Recipient.ID, fieldID, placement)
	if err != nil {
		return Field{}, Session{}, err
	}
	session, err = s.Session(ctx, tokenHash)
	return field, session, err
}

func (s *Service) CreateField(ctx context.Context, tokenHash []byte, input FieldCreateInput) (Field, Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Field{}, Session{}, err
	}
	input.Type = strings.TrimSpace(input.Type)
	input.Label = strings.TrimSpace(input.Label)
	if input.DocumentID == "" || input.Type == "" || input.Page < 1 {
		return Field{}, Session{}, errors.New("invalid field input")
	}
	field, err := s.store.CreateField(ctx, session.Recipient.ID, input)
	if err != nil {
		return Field{}, Session{}, err
	}
	session, err = s.Session(ctx, tokenHash)
	return field, session, err
}

func (s *Service) DeleteField(ctx context.Context, tokenHash []byte, fieldID string) (Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if err := s.store.DeleteField(ctx, session.Recipient.ID, fieldID); err != nil {
		return Session{}, err
	}
	return s.Session(ctx, tokenHash)
}

func (s *Service) Complete(ctx context.Context, tokenHash []byte, audit AuditContext) (Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if remainingRequired(session.Fields, session.Recipient.ID) > 0 && session.Recipient.Role == "signer" {
		return Session{}, ErrNotReady
	}
	if err := s.store.Complete(ctx, session.Recipient.ID, audit); err != nil {
		return Session{}, err
	}
	envelopeID := session.Envelope.ID
	if s.completer != nil {
		if cerr := s.completer.OnRecipientCompleted(ctx, envelopeID); cerr != nil {
			slog.Error("advance signing order", "error", cerr, "envelopeId", envelopeID)
		}
	}
	session, err = s.Session(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if session.Envelope.Status == "completed" && s.finalizer != nil {
		if ferr := s.finalizer.Finalize(ctx, session.Envelope.ID); ferr != nil {
			slog.Error("finalize completed envelope", "error", ferr, "envelopeId", session.Envelope.ID)
		}
	}
	return session, nil
}

func (s *Service) Decline(ctx context.Context, tokenHash []byte, reason string, audit AuditContext) error {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return errors.New("decline reason is required")
	}
	return s.store.Decline(ctx, session.Recipient.ID, reason, audit)
}

func (s *Service) Download(ctx context.Context, tokenHash []byte, documentID string) (StoredDocument, io.ReadCloser, error) {
	session, err := s.Session(ctx, tokenHash)
	if err != nil {
		return StoredDocument{}, nil, err
	}
	document, err := s.store.Document(ctx, session.Envelope.ID, documentID)
	if err != nil {
		return StoredDocument{}, nil, err
	}
	body, err := func() (io.ReadCloser, error) {
		store, err := s.objects.For(ctx, storage.OrganizationIDFromKey(document.ObjectKey))
		if err != nil {
			return nil, err
		}
		return store.Get(ctx, document.ObjectKey)
	}()
	if err != nil {
		return StoredDocument{}, nil, err
	}
	return document, body, nil
}

func (s *Service) DownloadAttachment(ctx context.Context, tokenHash []byte, attachmentID string) (Attachment, string, string, io.ReadCloser, error) {
	session, err := s.Session(ctx, tokenHash)
	if err != nil {
		return Attachment{}, "", "", nil, err
	}
	objectKey, filename, mimeType, err := s.store.AttachmentFile(ctx, session.Envelope.ID, attachmentID)
	if err != nil {
		return Attachment{}, "", "", nil, err
	}
	store, err := s.objects.For(ctx, storage.OrganizationIDFromKey(objectKey))
	if err != nil {
		return Attachment{}, "", "", nil, err
	}
	body, err := store.Get(ctx, objectKey)
	if err != nil {
		return Attachment{}, "", "", nil, err
	}
	var item Attachment
	for _, attachment := range session.Attachments {
		if attachment.ID == attachmentID {
			item = attachment
			break
		}
	}
	if item.ID == "" {
		item.ID = attachmentID
	}
	return item, filename, mimeType, body, nil
}

const maxFieldUploadSize int64 = 25 << 20

func MaxFieldUploadSize() int64 { return maxFieldUploadSize }

var allowedUploadMimeTypes = map[string]bool{
	"application/pdf":    true,
	"image/jpeg":         true,
	"image/png":          true,
	"image/webp":         true,
	"text/plain":         true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

func (s *Service) UploadFieldFile(ctx context.Context, tokenHash []byte, fieldID, filename string, size int64, body io.Reader) (Field, Session, error) {
	session, err := s.requireActive(ctx, tokenHash)
	if err != nil {
		return Field{}, Session{}, err
	}
	fieldType, envelopeID, orgID, err := s.store.FieldContext(ctx, session.Recipient.ID, fieldID)
	if err != nil {
		return Field{}, Session{}, err
	}
	if fieldType != "attachment" {
		return Field{}, Session{}, errors.New("field does not accept file uploads")
	}
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "upload"
	}
	if size <= 0 || size > maxFieldUploadSize {
		return Field{}, Session{}, fmt.Errorf("upload must be between 1 byte and %d bytes", maxFieldUploadSize)
	}
	limited := io.LimitReader(bufio.NewReader(body), maxFieldUploadSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return Field{}, Session{}, err
	}
	if int64(len(data)) == 0 || int64(len(data)) > maxFieldUploadSize {
		return Field{}, Session{}, fmt.Errorf("upload must be between 1 byte and %d bytes", maxFieldUploadSize)
	}
	mimeType := uploadMimeType(filename)
	if !allowedUploadMimeTypes[mimeType] {
		return Field{}, Session{}, errors.New("unsupported upload file type")
	}
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	ext := uploadExt(filename)
	key := orgID + "/" + envelopeID + "/field-uploads/" + fieldID + "/" + uuid.NewString() + ext
	store, err := s.objects.For(ctx, orgID)
	if err != nil {
		return Field{}, Session{}, err
	}
	if err := store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return Field{}, Session{}, fmt.Errorf("store upload: %w", err)
	}
	payload, err := json.Marshal(map[string]any{
		"filename":  filename,
		"mimeType":  mimeType,
		"sizeBytes": len(data),
		"sha256":    hash,
		"objectKey": key,
	})
	if err != nil {
		_ = store.Delete(ctx, key)
		return Field{}, Session{}, err
	}
	field, err := s.store.SaveField(ctx, session.Recipient.ID, fieldID, payload, nil)
	if err != nil {
		_ = store.Delete(ctx, key)
		return Field{}, Session{}, err
	}
	session, err = s.Session(ctx, tokenHash)
	return field, session, err
}

func uploadExt(name string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 {
		return name[idx:]
	}
	return ""
}

func uploadMimeType(filename string) string {
	switch strings.ToLower(uploadExt(filename)) {
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
		return "application/octet-stream"
	}
}

func (s *Service) requireActive(ctx context.Context, tokenHash []byte) (Session, error) {
	session, err := s.Session(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if session.Recipient.Status == "completed" || session.Recipient.Status == "declined" {
		return Session{}, ErrAlreadyFinished
	}
	if !session.CanAct {
		return Session{}, ErrUnavailable
	}
	return session, nil
}

func remainingRequired(fields []Field, recipientID string) int {
	count := 0
	for _, field := range fields {
		if field.RecipientID == recipientID && field.Required && !field.Completed {
			count++
		}
	}
	return count
}
