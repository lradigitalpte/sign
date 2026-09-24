package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifyAcceptsAuthKitAccessTokenWithoutClientID(t *testing.T) {
	private, jwks := testJWKS(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(server.Close)

	verifier, err := NewWorkOSVerifier("client_test", "https://api.workos.com/", server.URL)
	if err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":    "user_123",
		"sid":    "session_123",
		"org_id": "org_123",
		"iss":    "https://auth.workos.com",
		"iat":    now.Unix(),
		"exp":    now.Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "key_test"
	raw, err := token.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}

	identity, err := verifier.Verify(context.Background(), raw)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if identity.Subject != "user_123" || identity.SessionID != "session_123" || identity.OrganizationID != "org_123" {
		t.Fatalf("identity %+v", identity)
	}
}

func TestVerifyRejectsWrongAudience(t *testing.T) {
	private, jwks := testJWKS(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jwks)
	}))
	t.Cleanup(server.Close)

	verifier, err := NewWorkOSVerifier("client_test", "https://api.workos.com/", server.URL)
	if err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": "user_123",
		"sid": "session_123",
		"iss": "https://api.workos.com/",
		"aud": "client_other",
		"iat": now.Unix(),
		"exp": now.Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "key_test"
	raw, err := token.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.Verify(context.Background(), raw); err == nil {
		t.Fatal("expected invalid token")
	}
}

func TestVerifyAcceptsApplicationSpecificIssuer(t *testing.T) {
	private, jwks := testJWKS(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _ = json.NewEncoder(w).Encode(jwks) }))
	t.Cleanup(server.Close)
	verifier, err := NewWorkOSVerifier("client_test", "https://api.workos.com/", server.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"sub": "user_123", "sid": "session_123", "iss": "https://api.workos.com/user_management/client_test", "iat": now.Unix(), "exp": now.Add(time.Hour).Unix()})
	token.Header["kid"] = "key_test"
	raw, err := token.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.Verify(context.Background(), raw); err != nil {
		t.Fatalf("verify application issuer: %v", err)
	}
}

func TestVerifyRejectsApplicationIssuerForDifferentClient(t *testing.T) {
	if issuerAllowed("https://api.workos.com/", "https://api.workos.com/user_management/client_other", "client_test") {
		t.Fatal("issuer for another client must be rejected")
	}
}

func testJWKS(t *testing.T) (*rsa.PrivateKey, map[string]any) {
	t.Helper()
	private, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	n := base64.RawURLEncoding.EncodeToString(private.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(private.E)).Bytes())
	return private, map[string]any{
		"keys": []map[string]string{{
			"kty": "RSA",
			"kid": "key_test",
			"n":   n,
			"e":   e,
		}},
	}
}
