package storage

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"signing-platform/internal/securetoken"
)

const SettingsSection = "storage"

type Provider string

const (
	ProviderPlatform      Provider = "platform"
	ProviderS3            Provider = "s3"
	ProviderR2            Provider = "r2"
	ProviderS3Compatible  Provider = "s3_compatible"
)

type OrgConfig struct {
	Provider           Provider `json:"provider"`
	Endpoint           string   `json:"endpoint"`
	Bucket             string   `json:"bucket"`
	Region             string   `json:"region"`
	UseSSL             bool     `json:"useSsl"`
	AccessKeyID        string   `json:"accessKeyId"`
	SecretAccessKeyEnc string   `json:"secretAccessKeyEnc,omitempty"`
	Enabled            bool     `json:"enabled"`
	LastTestedAt       *string  `json:"lastTestedAt,omitempty"`
	LastError          string   `json:"lastError,omitempty"`
}

type PublicConfig struct {
	Provider          Provider `json:"provider"`
	Endpoint          string   `json:"endpoint"`
	Bucket            string   `json:"bucket"`
	Region            string   `json:"region"`
	UseSSL            bool     `json:"useSsl"`
	AccessKeyID       string   `json:"accessKeyId"`
	SecretAccessKeySet bool    `json:"secretAccessKeySet"`
	Enabled           bool     `json:"enabled"`
	LastTestedAt      *string  `json:"lastTestedAt,omitempty"`
	LastError         string   `json:"lastError,omitempty"`
	UsingPlatform     bool     `json:"usingPlatform"`
}

type SaveInput struct {
	Provider        Provider `json:"provider"`
	Endpoint        string   `json:"endpoint"`
	Bucket          string   `json:"bucket"`
	Region          string   `json:"region"`
	UseSSL          bool     `json:"useSsl"`
	AccessKeyID     string   `json:"accessKeyId"`
	SecretAccessKey string   `json:"secretAccessKey"`
	Enabled         bool     `json:"enabled"`
}

type Resolver interface {
	For(ctx context.Context, organizationID string) (ObjectStore, error)
	Invalidate(organizationID string)
}

type staticResolver struct{ store ObjectStore }

func Static(store ObjectStore) Resolver { return staticResolver{store: store} }

func (s staticResolver) For(context.Context, string) (ObjectStore, error) { return s.store, nil }
func (s staticResolver) Invalidate(string)                                {}

type OrgResolver struct {
	db        *pgxpool.Pool
	platform  ObjectStore
	protector *securetoken.Protector
	mu        sync.Mutex
	cache     map[string]cachedStore
}

type cachedStore struct {
	fingerprint string
	store       ObjectStore
}

func NewOrgResolver(db *pgxpool.Pool, platform ObjectStore, protector *securetoken.Protector) *OrgResolver {
	return &OrgResolver{
		db:        db,
		platform:  platform,
		protector: protector,
		cache:     map[string]cachedStore{},
	}
}

func (r *OrgResolver) For(ctx context.Context, organizationID string) (ObjectStore, error) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return r.platform, nil
	}
	cfg, err := r.Load(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled || cfg.Provider == ProviderPlatform || cfg.Provider == "" {
		return r.platform, nil
	}
	fingerprint := cfg.fingerprint()
	r.mu.Lock()
	if cached, ok := r.cache[organizationID]; ok && cached.fingerprint == fingerprint {
		store := cached.store
		r.mu.Unlock()
		return store, nil
	}
	r.mu.Unlock()

	secret, err := r.decryptSecret(cfg.SecretAccessKeyEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt storage credentials: %w", err)
	}
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = defaultEndpoint(cfg.Provider, cfg.Region)
	}
	if endpoint == "" || strings.TrimSpace(cfg.Bucket) == "" || strings.TrimSpace(cfg.AccessKeyID) == "" || secret == "" {
		return nil, errors.New("organization storage is enabled but incomplete")
	}
	store, err := OpenBucket(ctx, endpoint, strings.TrimSpace(cfg.AccessKeyID), secret, strings.TrimSpace(cfg.Bucket), cfg.UseSSL)
	if err != nil {
		return nil, fmt.Errorf("connect organization storage: %w", err)
	}

	r.mu.Lock()
	r.cache[organizationID] = cachedStore{fingerprint: fingerprint, store: store}
	r.mu.Unlock()
	return store, nil
}

func (r *OrgResolver) Invalidate(organizationID string) {
	r.mu.Lock()
	delete(r.cache, organizationID)
	r.mu.Unlock()
}

func (r *OrgResolver) Load(ctx context.Context, organizationID string) (OrgConfig, error) {
	var raw []byte
	err := r.db.QueryRow(ctx, `SELECT COALESCE((SELECT config FROM organization_settings WHERE organization_id = $1::uuid AND section = $2), '{}'::jsonb)`, organizationID, SettingsSection).Scan(&raw)
	if err != nil {
		return OrgConfig{}, err
	}
	var cfg OrgConfig
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return OrgConfig{}, err
		}
	}
	if cfg.Provider == "" {
		cfg.Provider = ProviderPlatform
	}
	return cfg, nil
}

func (r *OrgResolver) Public(ctx context.Context, organizationID string) (PublicConfig, error) {
	cfg, err := r.Load(ctx, organizationID)
	if err != nil {
		return PublicConfig{}, err
	}
	usingPlatform := !cfg.Enabled || cfg.Provider == ProviderPlatform || cfg.Provider == ""
	return PublicConfig{
		Provider:           cfg.Provider,
		Endpoint:           cfg.Endpoint,
		Bucket:             cfg.Bucket,
		Region:             cfg.Region,
		UseSSL:             cfg.UseSSL,
		AccessKeyID:        cfg.AccessKeyID,
		SecretAccessKeySet: cfg.SecretAccessKeyEnc != "",
		Enabled:            cfg.Enabled && !usingPlatform,
		LastTestedAt:       cfg.LastTestedAt,
		LastError:          cfg.LastError,
		UsingPlatform:      usingPlatform,
	}, nil
}

func (r *OrgResolver) Save(ctx context.Context, organizationID string, input SaveInput) (PublicConfig, error) {
	existing, err := r.Load(ctx, organizationID)
	if err != nil {
		return PublicConfig{}, err
	}
	provider := input.Provider
	if provider == "" {
		provider = ProviderPlatform
	}
	cfg := OrgConfig{
		Provider:     provider,
		Endpoint:     strings.TrimSpace(input.Endpoint),
		Bucket:       strings.TrimSpace(input.Bucket),
		Region:       strings.TrimSpace(input.Region),
		UseSSL:       input.UseSSL,
		AccessKeyID:  strings.TrimSpace(input.AccessKeyID),
		Enabled:      input.Enabled && provider != ProviderPlatform,
		LastTestedAt: existing.LastTestedAt,
		LastError:    existing.LastError,
	}
	if provider == ProviderPlatform {
		cfg = OrgConfig{Provider: ProviderPlatform, Enabled: false, UseSSL: true}
	} else {
		secret := strings.TrimSpace(input.SecretAccessKey)
		if secret != "" {
			enc, err := r.encryptSecret(secret)
			if err != nil {
				return PublicConfig{}, err
			}
			cfg.SecretAccessKeyEnc = enc
		} else {
			cfg.SecretAccessKeyEnc = existing.SecretAccessKeyEnc
		}
		if cfg.AccessKeyID == "" {
			cfg.AccessKeyID = existing.AccessKeyID
		}
		if err := validateBYOS(cfg); err != nil {
			return PublicConfig{}, err
		}
	}
	if err := r.persist(ctx, organizationID, cfg); err != nil {
		return PublicConfig{}, err
	}
	r.Invalidate(organizationID)
	return r.Public(ctx, organizationID)
}

func (r *OrgResolver) Disconnect(ctx context.Context, organizationID string) (PublicConfig, error) {
	cfg := OrgConfig{Provider: ProviderPlatform, Enabled: false, UseSSL: true}
	if err := r.persist(ctx, organizationID, cfg); err != nil {
		return PublicConfig{}, err
	}
	r.Invalidate(organizationID)
	return r.Public(ctx, organizationID)
}

func (r *OrgResolver) Test(ctx context.Context, organizationID string, input *SaveInput) (PublicConfig, error) {
	var cfg OrgConfig
	var secret string
	var err error
	if input != nil && input.Provider != "" && input.Provider != ProviderPlatform {
		cfg = OrgConfig{
			Provider:    input.Provider,
			Endpoint:    strings.TrimSpace(input.Endpoint),
			Bucket:      strings.TrimSpace(input.Bucket),
			Region:      strings.TrimSpace(input.Region),
			UseSSL:      input.UseSSL,
			AccessKeyID: strings.TrimSpace(input.AccessKeyID),
			Enabled:     true,
		}
		secret = strings.TrimSpace(input.SecretAccessKey)
		if secret == "" {
			existing, loadErr := r.Load(ctx, organizationID)
			if loadErr != nil {
				return PublicConfig{}, loadErr
			}
			secret, err = r.decryptSecret(existing.SecretAccessKeyEnc)
			if err != nil {
				return PublicConfig{}, err
			}
			if cfg.AccessKeyID == "" {
				cfg.AccessKeyID = existing.AccessKeyID
			}
			cfg.SecretAccessKeyEnc = existing.SecretAccessKeyEnc
		}
	} else {
		cfg, err = r.Load(ctx, organizationID)
		if err != nil {
			return PublicConfig{}, err
		}
		secret, err = r.decryptSecret(cfg.SecretAccessKeyEnc)
		if err != nil {
			return PublicConfig{}, err
		}
	}
	if err := validateBYOS(cfg); err != nil {
		return PublicConfig{}, err
	}
	if secret == "" {
		return PublicConfig{}, errors.New("secret access key is required to test the connection")
	}
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = defaultEndpoint(cfg.Provider, cfg.Region)
	}
	store, err := OpenBucket(ctx, endpoint, cfg.AccessKeyID, secret, cfg.Bucket, cfg.UseSSL)
	now := time.Now().UTC().Format(time.RFC3339)
	existing, _ := r.Load(ctx, organizationID)
	if err != nil {
		existing.LastError = err.Error()
		existing.LastTestedAt = &now
		_ = r.persist(ctx, organizationID, existing)
		return PublicConfig{}, err
	}
	if err := store.Ping(ctx); err != nil {
		existing.LastError = err.Error()
		existing.LastTestedAt = &now
		_ = r.persist(ctx, organizationID, existing)
		return PublicConfig{}, err
	}
	existing.LastError = ""
	existing.LastTestedAt = &now
	if existing.Provider == ProviderPlatform || existing.Provider == "" {
		// keep probe result metadata only when config already saved as BYOS
	} else {
		_ = r.persist(ctx, organizationID, existing)
	}
	pub, _ := r.Public(ctx, organizationID)
	pub.LastTestedAt = &now
	pub.LastError = ""
	return pub, nil
}

func (r *OrgResolver) persist(ctx context.Context, organizationID string, cfg OrgConfig) error {
	payload, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, $2, $3::jsonb)
		ON CONFLICT (organization_id, section) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`, organizationID, SettingsSection, payload)
	return err
}

func (r *OrgResolver) encryptSecret(secret string) (string, error) {
	ciphertext, err := r.protector.Encrypt([]byte(secret))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (r *OrgResolver) decryptSecret(encoded string) (string, error) {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	plain, err := r.protector.Decrypt(raw)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func validateBYOS(cfg OrgConfig) error {
	if cfg.Provider == ProviderPlatform || cfg.Provider == "" {
		return errors.New("choose s3, r2, or s3_compatible")
	}
	switch cfg.Provider {
	case ProviderS3, ProviderR2, ProviderS3Compatible:
	default:
		return fmt.Errorf("unsupported storage provider %q", cfg.Provider)
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return errors.New("bucket is required")
	}
	if strings.TrimSpace(cfg.AccessKeyID) == "" {
		return errors.New("access key id is required")
	}
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" {
		endpoint = defaultEndpoint(cfg.Provider, cfg.Region)
	}
	if endpoint == "" {
		return errors.New("endpoint is required")
	}
	return nil
}

func defaultEndpoint(provider Provider, region string) string {
	region = strings.TrimSpace(region)
	switch provider {
	case ProviderS3:
		if region == "" || region == "us-east-1" {
			return "s3.amazonaws.com"
		}
		return fmt.Sprintf("s3.%s.amazonaws.com", region)
	case ProviderR2:
		return ""
	default:
		return ""
	}
}

func (c OrgConfig) fingerprint() string {
	return strings.Join([]string{
		string(c.Provider),
		c.Endpoint,
		c.Bucket,
		c.Region,
		fmt.Sprintf("%t", c.UseSSL),
		c.AccessKeyID,
		c.SecretAccessKeyEnc,
		fmt.Sprintf("%t", c.Enabled),
	}, "|")
}

// OrganizationIDFromKey extracts the organization UUID prefix from an object key.
func OrganizationIDFromKey(key string) string {
	key = strings.TrimPrefix(key, "/")
	parts := strings.Split(key, "/")
	if len(parts) == 0 {
		return ""
	}
	if parts[0] == "pdf-security" && len(parts) > 1 {
		return parts[1]
	}
	return parts[0]
}