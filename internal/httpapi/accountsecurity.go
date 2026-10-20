package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	platformauth "signing-platform/internal/auth"
	"signing-platform/internal/email"
	"signing-platform/internal/identity"
)

// Sign-in is handled by WorkOS, so the Security page reads and changes the account there:
// two-factor status, signed-in sessions, and password resets (sent by email, so a stolen session
// can't change the password on its own).
type accountSecurity struct {
	apiKey  string
	baseURL string
	client  *http.Client
	mailer  email.Mailer
	logger  *slog.Logger
}

func newAccountSecurity(apiKey string, mailer email.Mailer, logger *slog.Logger) *accountSecurity {
	return &accountSecurity{apiKey: apiKey, baseURL: "https://api.workos.com", client: &http.Client{Timeout: 8 * time.Second}, mailer: mailer, logger: logger}
}

func (a *accountSecurity) workos(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = strings.NewReader(string(raw))
	}
	req, err := http.NewRequestWithContext(ctx, method, a.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("WorkOS %s %s returned %s: %s", method, path, resp.Status, strings.TrimSpace(string(detail)))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

type securityFactor struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"createdAt"`
}

type securitySession struct {
	ID         string    `json:"id"`
	IPAddress  string    `json:"ipAddress"`
	UserAgent  string    `json:"userAgent"`
	AuthMethod string    `json:"authMethod"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
	Current    bool      `json:"current"`
}

type securityOverview struct {
	TwoFactor struct {
		Enabled bool             `json:"enabled"`
		Factors []securityFactor `json:"factors"`
	} `json:"twoFactor"`
	Sessions           []securitySession `json:"sessions"`
	PasswordResetEmail bool              `json:"passwordResetEmail"` // false when no email provider is set up
}

func (a *accountSecurity) factors(ctx context.Context, subject string) ([]securityFactor, error) {
	var list struct {
		Data []struct {
			ID        string    `json:"id"`
			Type      string    `json:"type"`
			CreatedAt time.Time `json:"created_at"`
		} `json:"data"`
	}
	if err := a.workos(ctx, http.MethodGet, "/user_management/users/"+url.PathEscape(subject)+"/auth_factors?limit=20", nil, &list); err != nil {
		return nil, err
	}
	factors := []securityFactor{}
	for _, f := range list.Data {
		factors = append(factors, securityFactor{ID: f.ID, Type: f.Type, CreatedAt: f.CreatedAt})
	}
	return factors, nil
}

func (a *accountSecurity) sessions(ctx context.Context, subject, currentSession string) ([]securitySession, error) {
	var list struct {
		Data []struct {
			ID         string    `json:"id"`
			IPAddress  string    `json:"ip_address"`
			UserAgent  string    `json:"user_agent"`
			AuthMethod string    `json:"auth_method"`
			Status     string    `json:"status"`
			CreatedAt  time.Time `json:"created_at"`
			UpdatedAt  time.Time `json:"updated_at"`
			ExpiresAt  time.Time `json:"expires_at"`
		} `json:"data"`
	}
	if err := a.workos(ctx, http.MethodGet, "/user_management/users/"+url.PathEscape(subject)+"/sessions?limit=50", nil, &list); err != nil {
		return nil, err
	}
	sessions := []securitySession{}
	for _, s := range list.Data {
		if s.Status != "" && s.Status != "active" {
			continue
		}
		sessions = append(sessions, securitySession{ID: s.ID, IPAddress: s.IPAddress, UserAgent: s.UserAgent, AuthMethod: s.AuthMethod,
			CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt, ExpiresAt: s.ExpiresAt, Current: s.ID == currentSession})
	}
	return sessions, nil
}

func (a *accountSecurity) revoke(ctx context.Context, sessionID string) error {
	return a.workos(ctx, http.MethodPost, "/user_management/sessions/revoke", map[string]string{"session_id": sessionID}, nil)
}

// routes mounts under /v1/account/security.
func (a *accountSecurity) routes(r chi.Router) {
	r.Get("/", func(w http.ResponseWriter, request *http.Request) {
		auth, ok := platformauth.IdentityFromContext(request.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		var overview securityOverview
		var err error
		if overview.TwoFactor.Factors, err = a.factors(request.Context(), auth.Subject); err != nil {
			a.fail(w, "list auth factors", err)
			return
		}
		overview.TwoFactor.Enabled = len(overview.TwoFactor.Factors) > 0
		if overview.Sessions, err = a.sessions(request.Context(), auth.Subject, auth.SessionID); err != nil {
			a.fail(w, "list sessions", err)
			return
		}
		overview.PasswordResetEmail = a.mailer != nil
		writeJSON(w, http.StatusOK, overview)
	})

	r.Post("/sessions/{id}/revoke", func(w http.ResponseWriter, request *http.Request) {
		auth, ok := platformauth.IdentityFromContext(request.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		target := chi.URLParam(request, "id")
		// Only the user's own sessions can be signed out.
		sessions, err := a.sessions(request.Context(), auth.Subject, auth.SessionID)
		if err != nil {
			a.fail(w, "list sessions", err)
			return
		}
		owned := false
		for _, s := range sessions {
			owned = owned || s.ID == target
		}
		if !owned {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "That session isn't active anymore."})
			return
		}
		if err := a.revoke(request.Context(), target); err != nil {
			a.fail(w, "revoke session", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	r.Post("/sessions/revoke-others", func(w http.ResponseWriter, request *http.Request) {
		auth, ok := platformauth.IdentityFromContext(request.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		sessions, err := a.sessions(request.Context(), auth.Subject, auth.SessionID)
		if err != nil {
			a.fail(w, "list sessions", err)
			return
		}
		revoked := 0
		for _, s := range sessions {
			if s.Current {
				continue
			}
			if err := a.revoke(request.Context(), s.ID); err != nil {
				a.fail(w, "revoke session", err)
				return
			}
			revoked++
		}
		writeJSON(w, http.StatusOK, map[string]int{"revoked": revoked})
	})

	r.Post("/password-reset", func(w http.ResponseWriter, request *http.Request) {
		current, ok := identity.SessionFromContext(request.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		if a.mailer == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Email isn't set up, so a reset link can't be sent."})
			return
		}
		var reset struct {
			PasswordResetURL string `json:"password_reset_url"`
			ExpiresAt        string `json:"expires_at"`
		}
		if err := a.workos(request.Context(), http.MethodPost, "/user_management/password_reset", map[string]string{"email": current.User.Email}, &reset); err != nil {
			a.fail(w, "create password reset", err)
			return
		}
		if reset.PasswordResetURL == "" {
			a.fail(w, "create password reset", errors.New("WorkOS returned no reset URL"))
			return
		}
		if _, err := a.mailer.Send(request.Context(), email.PasswordReset(current.User.Email, current.User.Name, reset.PasswordResetURL)); err != nil {
			a.fail(w, "send password reset email", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"sentTo": current.User.Email})
	})
}

func (a *accountSecurity) fail(w http.ResponseWriter, action string, err error) {
	a.logger.Error("account security: "+action, "error", err)
	writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Couldn't reach the sign-in service. Try again in a moment."})
}
