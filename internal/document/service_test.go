package document

import (
	"bytes"
	"context"
	"io"
	"testing"

	"signing-platform/internal/pdfutil"
	"signing-platform/internal/storage"
)

type memoryObjects struct {
	data    []byte
	deleted bool
}

func (m *memoryObjects) Put(_ context.Context, _ string, r io.Reader, _ int64, _ string) error {
	m.data, _ = io.ReadAll(r)
	return nil
}
func (m *memoryObjects) Get(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(m.data)), nil
}
func (m *memoryObjects) Delete(context.Context, string) error { m.deleted = true; return nil }

type fakeRepo struct {
	hash      string
	pageCount int
}

func (f *fakeRepo) Create(_ context.Context, _, _, name string, size int64, pageCount int, _, hash string) (Document, error) {
	f.hash = hash
	f.pageCount = pageCount
	return Document{ID: "doc", Filename: name, SizeBytes: size, PageCount: pageCount, SHA256: hash}, nil
}
func (f *fakeRepo) List(context.Context, string, string) ([]Document, error) { return nil, nil }
func (f *fakeRepo) Get(context.Context, string, string, string) (StoredDocument, error) {
	return StoredDocument{}, ErrNotFound
}
func (f *fakeRepo) Delete(context.Context, string, string, string) (string, error) {
	return "", ErrNotFound
}

func TestUploadValidatesAndHashesPDF(t *testing.T) {
	objects := &memoryObjects{}
	repo := &fakeRepo{}
	body, err := pdfutil.Sample(2)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := NewService(repo, storage.Static(objects)).Upload(context.Background(), "org", "env", "agreement.pdf", int64(len(body)), bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if doc.ID != "doc" || doc.PageCount != 2 || repo.pageCount != 2 || len(repo.hash) != 64 || !bytes.Equal(objects.data, body) {
		t.Fatalf("unexpected upload %#v pageCount=%d", doc, repo.pageCount)
	}
}

func TestUploadRejectsNonPDF(t *testing.T) {
	body := []byte("hello")
	_, err := NewService(&fakeRepo{}, storage.Static(&memoryObjects{})).Upload(context.Background(), "org", "env", "bad.pdf", int64(len(body)), bytes.NewReader(body))
	if err != ErrInvalidPDF {
		t.Fatalf("error=%v", err)
	}
}

func TestUploadRejectsInvalidPDFHeaderOnly(t *testing.T) {
	body := []byte("%PDF-1.7\nnot-a-real-pdf")
	_, err := NewService(&fakeRepo{}, storage.Static(&memoryObjects{})).Upload(context.Background(), "org", "env", "bad.pdf", int64(len(body)), bytes.NewReader(body))
	if err != ErrInvalidPDF {
		t.Fatalf("error=%v", err)
	}
}
