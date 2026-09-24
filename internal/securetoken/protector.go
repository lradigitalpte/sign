package securetoken

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

type Protector struct{ aead cipher.AEAD }

func NewProtector(encodedKey string) (*Protector, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil || len(key) != 32 {
		return nil, errors.New("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Protector{aead: aead}, nil
}

func (p *Protector) Encrypt(value []byte) ([]byte, error) {
	nonce := make([]byte, p.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return p.aead.Seal(nonce, nonce, value, nil), nil
}

func (p *Protector) Decrypt(value []byte) ([]byte, error) {
	nonceSize := p.aead.NonceSize()
	if len(value) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ciphertext := value[:nonceSize], value[nonceSize:]
	return p.aead.Open(nil, nonce, ciphertext, nil)
}

func Generate() (raw string, hash []byte, err error) {
	value := make([]byte, 32)
	if _, err = io.ReadFull(rand.Reader, value); err != nil {
		return "", nil, err
	}
	raw = base64.RawURLEncoding.EncodeToString(value)
	return raw, Hash(raw), nil
}

func Hash(raw string) []byte {
	digest := sha256.Sum256([]byte(raw))
	return digest[:]
}
