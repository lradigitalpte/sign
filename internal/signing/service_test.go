package signing

import (
	"context"
	"encoding/json"
	"io"
	"testing"

	"signing-platform/internal/storage"
)

type fakeStore struct {
	session Session
}

func (f *fakeStore) Resolve(context.Context, []byte) (Session, error) { return f.session, nil }
func (f *fakeStore) MarkViewed(context.Context, string, AuditContext) error {
	return nil
}
func (f *fakeStore) SaveField(context.Context, string, string, json.RawMessage, *FieldPlacement) (Field, error) {
	return Field{}, nil
}
func (f *fakeStore) UpdateFieldPlacement(context.Context, string, string, FieldGeometry) (Field, error) {
	return Field{}, nil
}
func (f *fakeStore) CreateField(context.Context, string, FieldCreateInput) (Field, error) {
	return Field{}, nil
}
func (f *fakeStore) DeleteField(context.Context, string, string) error { return nil }
func (f *fakeStore) Complete(context.Context, string, AuditContext) error { return nil }
func (f *fakeStore) Decline(context.Context, string, string, AuditContext) error {
	return nil
}
func (f *fakeStore) Document(context.Context, string, string) (StoredDocument, error) {
	return StoredDocument{}, ErrInvalidToken
}
func (f *fakeStore) AttachmentFile(context.Context, string, string) (string, string, string, error) {
	return "", "", "", ErrInvalidToken
}
func (f *fakeStore) FieldContext(context.Context, string, string) (string, string, string, error) {
	return "", "", "", ErrUnavailable
}

type noopObjects struct{}

func (noopObjects) Put(context.Context, string, io.Reader, int64, string) error { return nil }
func (noopObjects) Get(context.Context, string) (io.ReadCloser, error)          { return nil, nil }
func (noopObjects) Delete(context.Context, string) error                        { return nil }

func TestCompleteRejectsMissingRequiredFields(t *testing.T) {
	store := &fakeStore{session: Session{
		Envelope:  Envelope{Status: "in_progress"},
		Recipient: Recipient{ID: "r1", Role: "signer", Status: "viewed"},
		Fields:    []Field{{ID: "f1", RecipientID: "r1", Required: true, Completed: false}},
	}}
	_, err := NewService(store, storage.Static(noopObjects{})).Complete(context.Background(), []byte("hash"), AuditContext{})
	if err != ErrNotReady {
		t.Fatalf("error=%v", err)
	}
}
