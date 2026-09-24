package finalize

import (
	"context"
	"encoding/json"
	"testing"

	"signing-platform/internal/storage"
)

func TestAppearanceText(t *testing.T) {
	if got := appearanceText("checkbox", json.RawMessage(`{"checked":true}`), "Ada"); got != "X" {
		t.Fatalf("checkbox=%q", got)
	}
	if got := appearanceText("date", json.RawMessage(`{"iso":"2026-08-30"}`), "Ada"); got != "2026-08-30" {
		t.Fatalf("date=%q", got)
	}
	if got := appearanceText("signature", json.RawMessage(`{"text":"Ada Lovelace"}`), "Ada"); got != "Ada Lovelace" {
		t.Fatalf("signature=%q", got)
	}
	if got := appearanceText("name", json.RawMessage(`{}`), "Ada Lovelace"); got != "Ada Lovelace" {
		t.Fatalf("fallback=%q", got)
	}
}

func TestAppearanceImage(t *testing.T) {
	png := appearanceImage(json.RawMessage(`{"text":"Ada","image":"data:image/png;base64,iVBORw0KGgo="}`))
	if len(png) == 0 {
		t.Fatal("expected decoded image bytes")
	}
	if appearanceImage(json.RawMessage(`{"text":"Ada"}`)) != nil {
		t.Fatal("expected no image")
	}
}

func TestFinalizeSkipsIncompleteEnvelope(t *testing.T) {
	store := &fakeFinalizeStore{completed: false}
	if err := NewService(store, storage.Static(nil)).Finalize(context.Background(), "env"); err != nil {
		t.Fatal(err)
	}
	if store.saved {
		t.Fatal("should not save completed PDF for an open envelope")
	}
}

type fakeFinalizeStore struct {
	completed bool
	saved     bool
}

func (f *fakeFinalizeStore) EnvelopeCompleted(context.Context, string) (bool, error) {
	return f.completed, nil
}
func (f *fakeFinalizeStore) Documents(context.Context, string) ([]storedDocument, error) {
	return nil, nil
}
func (f *fakeFinalizeStore) Appearances(context.Context, string) ([]appearance, error) {
	return nil, nil
}
func (f *fakeFinalizeStore) SaveCompleted(context.Context, string, string, string) error {
	f.saved = true
	return nil
}
