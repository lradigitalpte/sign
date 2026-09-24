package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeVerifier struct {
	identity Identity
	err      error
}

func (f fakeVerifier) Verify(context.Context, string) (Identity, error) { return f.identity, f.err }

func TestMiddlewareRejectsMissingBearerToken(t *testing.T) {
	handler := Middleware(fakeVerifier{})(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
}

func TestMiddlewareRejectsInvalidToken(t *testing.T) {
	handler := Middleware(fakeVerifier{err: errors.New("bad token")})(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer invalid")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
}

func TestMiddlewareAddsIdentityToContext(t *testing.T) {
	want := Identity{Subject: "user_123", SessionID: "session_123", OrganizationID: "org_123"}
	handler := Middleware(fakeVerifier{identity: want})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := IdentityFromContext(r.Context())
		if !ok || got.Subject != want.Subject {
			t.Fatal("identity missing from context")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer valid")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", recorder.Code)
	}
}
