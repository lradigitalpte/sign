package securetoken

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func TestGenerateAndProtectRoundTrip(t *testing.T) {
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	protector, err := NewProtector(key)
	if err != nil {
		t.Fatal(err)
	}
	raw, hash, err := Generate()
	if err != nil || raw == "" || len(hash) != 32 {
		t.Fatalf("generate %q %d %v", raw, len(hash), err)
	}
	ciphertext, err := protector.Encrypt([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	plain, err := protector.Decrypt(ciphertext)
	if err != nil || string(plain) != raw {
		t.Fatalf("decrypt %q %v", plain, err)
	}
}

func TestNewProtectorRejectsInvalidKey(t *testing.T) {
	if _, err := NewProtector("not-a-key"); err == nil {
		t.Fatal("expected invalid key")
	}
}
