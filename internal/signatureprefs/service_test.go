package signatureprefs

import (
	"bytes"
	"context"
	"encoding/base64"
	"testing"

	"signing-platform/internal/securetoken"
)

type memoryStore struct{ signature, initials []byte }

func (m *memoryStore) Get(context.Context, string) ([]byte, []byte, error) {
	return m.signature, m.initials, nil
}
func (m *memoryStore) Put(_ context.Context, _ string, signature, initials []byte) error {
	m.signature = signature
	m.initials = initials
	return nil
}

func TestPreferencesAreEncryptedAtRestAndRoundTrip(t *testing.T) {
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	protector, err := securetoken.NewProtector(key)
	if err != nil {
		t.Fatal(err)
	}
	store := &memoryStore{}
	service := NewService(store, protector)
	input := Preferences{Signature: []byte(`{"text":"Ada Lovelace"}`), Initials: []byte(`{"text":"AL"}`)}
	if _, err := service.Put(context.Background(), "user", input); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(store.signature, []byte("Ada")) || bytes.Contains(store.initials, []byte("AL")) {
		t.Fatal("appearance stored without encryption")
	}
	got, err := service.Get(context.Background(), "user")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.Signature, input.Signature) || !bytes.Equal(got.Initials, input.Initials) {
		t.Fatalf("round trip %#v", got)
	}
}
