package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLive(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	live(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status body = %q", body["status"])
	}
}

func TestExpectedShutdown(t *testing.T) {
	if !IsExpectedShutdown(http.ErrServerClosed) {
		t.Fatal("http.ErrServerClosed should be expected")
	}
}
