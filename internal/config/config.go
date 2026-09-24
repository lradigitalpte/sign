package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment         string
	APIAddress          string
	WebOrigin           string
	SigningOrigin       string
	DatabaseURL         string
	WorkOSClientID      string
	WorkOSAPIKey        string
	WorkOSIssuer        string
	WorkOSJWKSURL       string
	StorageEndpoint     string
	StorageAccessKey    string
	StorageSecretKey    string
	StorageBucket       string
	StorageUseSSL       bool
	TokenEncryptionKey  string
	SMTPHost            string
	SMTPPort            int
	SMTPFrom            string
	ResendAPIKey        string
	ResendFrom          string
	EmailPreviewAddress string
	EmailPreviewDir     string
	ShutdownTimeout     time.Duration
	ReadTimeout         time.Duration
	WriteTimeout        time.Duration
	IdleTimeout         time.Duration
}

func Load() (Config, error) {
	loadDotEnv()
	cfg := Config{
		Environment:         os.Getenv("APP_ENV"),
		APIAddress:          os.Getenv("API_ADDRESS"),
		WebOrigin:           os.Getenv("WEB_ORIGIN"),
		SigningOrigin:       os.Getenv("SIGNING_ORIGIN"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		WorkOSClientID:      os.Getenv("WORKOS_CLIENT_ID"),
		WorkOSAPIKey:        os.Getenv("WORKOS_API_KEY"),
		WorkOSIssuer:        os.Getenv("WORKOS_ISSUER"),
		WorkOSJWKSURL:       os.Getenv("WORKOS_JWKS_URL"),
		StorageEndpoint:     os.Getenv("STORAGE_ENDPOINT"),
		StorageAccessKey:    os.Getenv("STORAGE_ACCESS_KEY"),
		StorageSecretKey:    os.Getenv("STORAGE_SECRET_KEY"),
		StorageBucket:       os.Getenv("STORAGE_BUCKET"),
		TokenEncryptionKey:  os.Getenv("TOKEN_ENCRYPTION_KEY"),
		SMTPHost:            os.Getenv("SMTP_HOST"),
		SMTPFrom:            os.Getenv("SMTP_FROM"),
		ResendAPIKey:        os.Getenv("RESEND_API_KEY"),
		ResendFrom:          os.Getenv("RESEND_FROM"),
		EmailPreviewAddress: os.Getenv("EMAIL_PREVIEW_ADDRESS"),
		EmailPreviewDir:     os.Getenv("EMAIL_PREVIEW_DIR"),
	}

	if cfg.Environment == "" {
		cfg.Environment = "development"
	}
	if cfg.APIAddress == "" {
		cfg.APIAddress = ":8080"
	}
	if cfg.WebOrigin == "" {
		cfg.WebOrigin = "http://localhost:3000"
	}
	if cfg.SigningOrigin == "" {
		cfg.SigningOrigin = cfg.WebOrigin
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.WorkOSIssuer == "" {
		cfg.WorkOSIssuer = "https://api.workos.com/"
	}
	if cfg.WorkOSClientID != "" && cfg.WorkOSJWKSURL == "" {
		cfg.WorkOSJWKSURL = "https://api.workos.com/sso/jwks/" + cfg.WorkOSClientID
	}
	if cfg.StorageEndpoint == "" {
		cfg.StorageEndpoint = "localhost:9000"
	}
	if cfg.StorageAccessKey == "" {
		cfg.StorageAccessKey = "signing"
	}
	if cfg.StorageSecretKey == "" {
		cfg.StorageSecretKey = "signing-development-secret"
	}
	if cfg.StorageBucket == "" {
		cfg.StorageBucket = "signing-documents"
	}
	cfg.StorageUseSSL = os.Getenv("STORAGE_USE_SSL") == "true"
	if cfg.SMTPFrom == "" {
		cfg.SMTPFrom = "Signing Platform <noreply@localhost>"
	}
	if cfg.ResendFrom == "" {
		cfg.ResendFrom = cfg.SMTPFrom
	}
	if cfg.EmailPreviewAddress == "" {
		cfg.EmailPreviewAddress = ":8090"
	}
	if cfg.EmailPreviewDir == "" {
		cfg.EmailPreviewDir = "var/email-previews"
	}

	var err error
	if cfg.SMTPPort, err = port("SMTP_PORT", 1025); err != nil {
		return Config{}, err
	}
	if cfg.ShutdownTimeout, err = duration("SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return Config{}, err
	}
	if cfg.ReadTimeout, err = duration("READ_TIMEOUT", 15*time.Second); err != nil {
		return Config{}, err
	}
	if cfg.WriteTimeout, err = duration("WRITE_TIMEOUT", 30*time.Second); err != nil {
		return Config{}, err
	}
	if cfg.IdleTimeout, err = duration("IDLE_TIMEOUT", 60*time.Second); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func loadDotEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for range 8 {
		path := filepath.Join(dir, ".env")
		if _, err := os.Stat(path); err == nil {
			_ = applyDotEnv(path)
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}

func applyDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	first := true
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			line = strings.TrimPrefix(line, "\uFEFF")
			first = false
		}
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, unquoteEnv(strings.TrimSpace(value))); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func unquoteEnv(value string) string {
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	return value
}

func duration(name string, fallback time.Duration) (time.Duration, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}

func port(name string, fallback int) (int, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 || parsed > 65535 {
		return 0, fmt.Errorf("parse %s: invalid port", name)
	}
	return parsed, nil
}
