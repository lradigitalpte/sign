package field

import (
	"context"
	"testing"
)

type fakeStore struct {
	input    CreateInput
	required bool
}

func (f *fakeStore) List(context.Context, string, string) ([]Field, error) { return nil, nil }
func (f *fakeStore) Create(_ context.Context, _, _ string, i CreateInput, r bool) (Field, error) {
	f.input = i
	f.required = r
	return Field{ID: "field", Required: r}, nil
}
func (f *fakeStore) Update(context.Context, string, string, string, UpdateInput) (Field, error) {
	return Field{ID: "field"}, nil
}
func (f *fakeStore) Delete(context.Context, string, string, string) error { return nil }
func TestCreateFieldDefaultsRequired(t *testing.T) {
	store := &fakeStore{}
	value, err := NewService(store).Create(context.Background(), "org", "env", CreateInput{DocumentID: "doc", RecipientID: "recipient", Type: "signature", Page: 1, X: 10, Y: 20, Width: 30, Height: 10})
	if err != nil {
		t.Fatal(err)
	}
	if !value.Required || !store.required {
		t.Fatal("field should be required")
	}
}
func TestCreateRejectsOutsidePage(t *testing.T) {
	_, err := NewService(&fakeStore{}).Create(context.Background(), "org", "env", CreateInput{DocumentID: "doc", RecipientID: "recipient", Type: "signature", Page: 1, X: 90, Y: 20, Width: 20, Height: 10})
	if err == nil {
		t.Fatal("expected bounds error")
	}
}
func TestCreateRejectsInvalidType(t *testing.T) {
	_, err := NewService(&fakeStore{}).Create(context.Background(), "org", "env", CreateInput{DocumentID: "doc", RecipientID: "recipient", Type: "button", Page: 1, Width: 10, Height: 10})
	if err == nil {
		t.Fatal("expected type error")
	}
}
