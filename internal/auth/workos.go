package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type WorkOSVerifier struct {
	clientID string
	issuer   string
	jwksURL  string
	client   *http.Client
	mu       sync.RWMutex
	keys     map[string]*rsa.PublicKey
}

type workOSClaims struct {
	ClientID       string   `json:"client_id"`
	SessionID      string   `json:"sid"`
	OrganizationID string   `json:"org_id"`
	Role           string   `json:"role"`
	Permissions    []string `json:"permissions"`
	jwt.RegisteredClaims
}

func NewWorkOSVerifier(clientID, issuer, jwksURL string) (*WorkOSVerifier, error) {
	if clientID == "" || issuer == "" || jwksURL == "" {
		return nil, fmt.Errorf("WorkOS client ID, issuer, and JWKS URL are required")
	}
	return &WorkOSVerifier{clientID: clientID, issuer: issuer, jwksURL: jwksURL, client: &http.Client{Timeout: 5 * time.Second}}, nil
}

func (v *WorkOSVerifier) Verify(ctx context.Context, raw string) (Identity, error) {
	claims := &workOSClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected alg %s", token.Method.Alg())
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("missing kid")
		}
		return v.key(ctx, kid)
	}, jwt.WithExpirationRequired(), jwt.WithLeeway(2*time.Minute))
	if err != nil {
		return Identity{}, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	if !token.Valid || claims.Subject == "" {
		return Identity{}, fmt.Errorf("%w: missing subject", ErrInvalidToken)
	}
	if !issuerAllowed(v.issuer, claims.Issuer, v.clientID) {
		return Identity{}, fmt.Errorf("%w: issuer %q", ErrInvalidToken, claims.Issuer)
	}
	if !v.matchesClient(claims) {
		return Identity{}, fmt.Errorf("%w: client mismatch", ErrInvalidToken)
	}
	sessionID := claims.SessionID
	if sessionID == "" {
		sessionID = claims.ID
	}
	return Identity{Subject: claims.Subject, SessionID: sessionID, OrganizationID: claims.OrganizationID, Role: claims.Role, Permissions: claims.Permissions}, nil
}

func issuerAllowed(configured, actual, clientID string) bool {
	got := strings.TrimRight(strings.TrimSpace(actual), "/")
	if got == "" {
		return true
	}
	want := strings.TrimRight(strings.TrimSpace(configured), "/")
	if strings.EqualFold(got, want) {
		return true
	}
	switch strings.ToLower(got) {
	case "https://api.workos.com", "https://auth.workos.com":
		return true
	}
	expectedApplicationIssuer := "https://api.workos.com/user_management/" + strings.TrimSpace(clientID)
	return strings.EqualFold(got, expectedApplicationIssuer)
}

func (v *WorkOSVerifier) matchesClient(claims *workOSClaims) bool {
	if claims.ClientID != "" {
		return claims.ClientID == v.clientID
	}
	var clientAudiences []string
	for _, audience := range claims.Audience {
		if strings.HasPrefix(audience, "client_") {
			clientAudiences = append(clientAudiences, audience)
		}
	}
	if len(clientAudiences) == 0 {
		return true
	}
	for _, audience := range clientAudiences {
		if audience == v.clientID {
			return true
		}
	}
	return false
}

func (v *WorkOSVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key := v.keys[kid]
	v.mu.RUnlock()
	if key != nil {
		return key, nil
	}
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	key = v.keys[kid]
	if key == nil {
		return nil, ErrInvalidToken
	}
	return key, nil
}

func (v *WorkOSVerifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}
	response, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS returned %s", response.Status)
	}
	var document struct {
		Keys []struct{ Kid, Kty, N, E string } `json:"keys"`
	}
	if err := json.NewDecoder(response.Body).Decode(&document); err != nil {
		return err
	}
	keys := make(map[string]*rsa.PublicKey)
	for _, jwk := range document.Keys {
		if jwk.Kty != "RSA" || jwk.Kid == "" {
			continue
		}
		n, err := base64.RawURLEncoding.DecodeString(jwk.N)
		if err != nil {
			continue
		}
		e, err := base64.RawURLEncoding.DecodeString(jwk.E)
		if err != nil || len(e) == 0 || len(e) > 8 {
			continue
		}
		padded := make([]byte, 8)
		copy(padded[8-len(e):], e)
		keys[jwk.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(binary.BigEndian.Uint64(padded))}
	}
	if len(keys) == 0 {
		return fmt.Errorf("JWKS contained no usable RSA keys")
	}
	v.mu.Lock()
	v.keys = keys
	v.mu.Unlock()
	return nil
}
