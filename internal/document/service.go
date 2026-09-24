package document

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"signing-platform/internal/pdfutil"
	"signing-platform/internal/storage"
)

const MaxUploadSize int64 = 25 << 20

var ErrInvalidPDF = errors.New("only valid PDF documents are accepted")
var ErrNotFound = errors.New("document not found")

type Document struct {
	ID              string    `json:"id"`
	EnvelopeID      string    `json:"envelopeId"`
	Position        int       `json:"position"`
	Filename        string    `json:"filename"`
	MimeType        string    `json:"mimeType"`
	SizeBytes       int64     `json:"sizeBytes"`
	PageCount       int       `json:"pageCount"`
	SHA256          string    `json:"sha256"`
	CompletedSHA256 *string   `json:"completedSha256,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

type StoredDocument struct {
	Document
	ObjectKey          string
	CompletedObjectKey string
}

type Repository interface {
	Create(context.Context, string, string, string, int64, int, string, string) (Document, error)
	List(context.Context, string, string) ([]Document, error)
	Get(context.Context, string, string, string) (StoredDocument, error)
	Delete(context.Context, string, string, string) (string, error)
}

type Completer interface {
	EnsureDocument(context.Context, string, string) error
}

type Service struct {
	repository Repository
	objects    storage.Resolver
	completer  Completer
}

func NewService(repository Repository, objects storage.Resolver) *Service {
	return &Service{repository: repository, objects: objects}
}

func (s *Service) WithCompleter(completer Completer) *Service {
	s.completer = completer
	return s
}

func (s *Service) Upload(ctx context.Context, organizationID, envelopeID, filename string, size int64, body io.Reader) (Document, error) {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "document.pdf"
	}
	if size > MaxUploadSize {
		return Document{}, fmt.Errorf("PDF must be between 1 byte and %d bytes", MaxUploadSize)
	}
	limited := io.LimitReader(bufio.NewReader(body), MaxUploadSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return Document{}, err
	}
	if len(data) == 0 || int64(len(data)) > MaxUploadSize {
		return Document{}, fmt.Errorf("PDF must be between 1 byte and %d bytes", MaxUploadSize)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return Document{}, ErrInvalidPDF
	}
	pageCount, err := pdfutil.CountPages(data)
	if err != nil {
		return Document{}, ErrInvalidPDF
	}
	key := organizationID + "/" + envelopeID + "/" + uuid.NewString() + ".pdf"
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	store, err := s.objects.For(ctx, organizationID)
	if err != nil {
		return Document{}, err
	}
	if err := store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), "application/pdf"); err != nil {
		return Document{}, fmt.Errorf("store PDF: %w", err)
	}
	document, err := s.repository.Create(ctx, organizationID, envelopeID, filename, int64(len(data)), pageCount, key, hash)
	if err != nil {
		_ = store.Delete(ctx, key)
		return Document{}, err
	}
	return document, nil
}

func (s *Service) List(ctx context.Context, organizationID, envelopeID string) ([]Document, error) {
	return s.repository.List(ctx, organizationID, envelopeID)
}

func (s *Service) Download(ctx context.Context, organizationID, envelopeID, documentID string, completed bool) (StoredDocument, io.ReadCloser, error) {
	document, err := s.repository.Get(ctx, organizationID, envelopeID, documentID)
	if err != nil {
		return StoredDocument{}, nil, err
	}
	if completed && s.completer != nil {
		if err := s.completer.EnsureDocument(ctx, envelopeID, documentID); err != nil {
			return StoredDocument{}, nil, fmt.Errorf("prepare completed document: %w", err)
		}
		document, err = s.repository.Get(ctx, organizationID, envelopeID, documentID)
		if err != nil {
			return StoredDocument{}, nil, err
		}
	}
	key := document.ObjectKey
	if completed {
		if document.CompletedObjectKey == "" {
			return StoredDocument{}, nil, ErrNotFound
		}
		key = document.CompletedObjectKey
		if document.CompletedSHA256 != nil {
			document.SHA256 = *document.CompletedSHA256
		}
		document.Filename = signedFilename(document.Filename)
	}
	body, err := func() (io.ReadCloser, error) {
		store, err := s.objects.For(ctx, organizationID)
		if err != nil {
			return nil, err
		}
		return store.Get(ctx, key)
	}()
	if err != nil {
		return StoredDocument{}, nil, err
	}
	return document, body, nil
}

func (s *Service) Delete(ctx context.Context, organizationID, envelopeID, documentID string) error {
	key, err := s.repository.Delete(ctx, organizationID, envelopeID, documentID)
	if err != nil {
		return err
	}
	if store, err := s.objects.For(ctx, organizationID); err == nil {
		_ = store.Delete(ctx, key)
	}
	return nil
}

func signedFilename(name string) string {
	base := strings.TrimSpace(name)
	if strings.HasSuffix(strings.ToLower(base), ".pdf") {
		base = strings.TrimSpace(base[:len(base)-4])
	}
	if base == "" {
		base = "document"
	}
	return base + "-signed.pdf"
}
