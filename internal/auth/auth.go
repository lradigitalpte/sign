package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

var ErrInvalidToken = errors.New("invalid access token")

type Identity struct {
	Subject        string   `json:"subject"`
	SessionID      string   `json:"sessionId"`
	OrganizationID string   `json:"organizationId,omitempty"`
	Role           string   `json:"role,omitempty"`
	Permissions    []string `json:"permissions,omitempty"`
}

type Verifier interface {
	Verify(context.Context, string) (Identity, error)
}

type contextKey struct{}

func IdentityFromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(contextKey{}).(Identity)
	return identity, ok
}

func Middleware(verifier Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			identity, err := verifier.Verify(r.Context(), strings.TrimSpace(parts[1]))
			if err != nil {
				slog.Warn("access token rejected", "error", err)
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, identity)))
		})
	}
}
