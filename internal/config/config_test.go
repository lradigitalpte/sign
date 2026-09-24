package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("APP_ENV", "")
	t.Setenv("API_ADDRESS", "")
	t.Setenv("WEB_ORIGIN", "")
	t.Setenv("SHUTDOWN_TIMEOUT", "")
	t.Setenv("READ_TIMEOUT", "")
	t.Setenv("WRITE_TIMEOUT", "")
	t.Setenv("IDLE_TIMEOUT", "")
	t.Setenv("SMTP_PORT", "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SIGNING_ORIGIN", "")
	t.Setenv("EMAIL_PREVIEW_ADDRESS", "")
	t.Setenv("EMAIL_PREVIEW_DIR", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Environment != "development" {
		t.Fatalf("Environment = %q", cfg.Environment)
	}
	if cfg.APIAddress != ":8080" {
		t.Fatalf("APIAddress = %q", cfg.APIAddress)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %s", cfg.ShutdownTimeout)
	}
	if cfg.SMTPPort != 1025 || cfg.EmailPreviewAddress != ":8090" || cfg.SigningOrigin != "http://localhost:3000" {
		t.Fatalf("email defaults %+v", cfg)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want an error")
	}
}

func TestLoadRejectsInvalidDuration(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("READ_TIMEOUT", "eventually")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want an error")
	}
}

func TestLoadRejectsInvalidSMTPPort(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SMTP_PORT", "0")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want an error")
	}
}

func TestApplyDotEnvSkipsExistingKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("DATABASE_URL=postgres://from-file\nAPI_ADDRESS=:9999\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DATABASE_URL", "postgres://already-set")
	t.Setenv("API_ADDRESS", "")
	os.Unsetenv("API_ADDRESS")

	if err := applyDotEnv(path); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("DATABASE_URL"); got != "postgres://already-set" {
		t.Fatalf("DATABASE_URL = %q", got)
	}
	if got := os.Getenv("API_ADDRESS"); got != ":9999" {
		t.Fatalf("API_ADDRESS = %q", got)
	}
}
