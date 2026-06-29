package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port         int
	Environment  string
	LogLevel     string
	LogFormat    string
	DatabaseURL  string
	// CrossEnvDatabaseURL is an OPTIONAL read-only connection string to the OTHER
	// environment's database (LIVE stack → banzami_staging, SANDBOX stack →
	// banzami). Used only to detect "this @handle lives in the other environment"
	// for the login UX (ADR-025). Empty disables cross-env detection.
	CrossEnvDatabaseURL string
	RedisURL            string
	CoreAPIURL   string
	OTLPEndpoint string // optional; tracing is a no-op when empty
	// JWTSecret is required for protected routes.
	// Deliberately left optional here so the gateway starts for health-check
	// purposes even before auth is fully wired.
	JWTSecret string
	// FirebaseCredentialsJSON holds the Firebase service-account JSON (minified).
	// When empty, push notifications are silently disabled.
	FirebaseCredentialsJSON string

	// WebhookEncryptionKey is a base64-encoded 32-byte key used to encrypt
	// webhook signing secrets at rest (SEC-002). Empty → plaintext (dev only).
	WebhookEncryptionKey string

	// InternalAPIKey guards the service-to-service /internal endpoints (called
	// only by admin-api). Empty → /internal endpoints are disabled (fail closed).
	InternalAPIKey string

	// KYB document storage (Track 3). All empty → storage disabled and the
	// document endpoints respond 503 STORAGE_NOT_CONFIGURED (no startup panic).
	KYBStorageProvider     string // "r2" | "s3"
	KYBStorageBucket       string
	KYBStorageEndpoint     string
	KYBStorageRegion       string // "auto" for R2
	KYBStorageAccessKeyID  string
	KYBStorageSecretKey    string
	KYBSignedURLTTLSeconds int
	KYBMaxFileSizeBytes    int64
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:                   8080,
		Environment:            "development",
		LogLevel:               "info",
		LogFormat:              "json",
		KYBStorageRegion:       "auto",
		KYBSignedURLTTLSeconds: 300,
		KYBMaxFileSizeBytes:    5 * 1024 * 1024,
	}

	if v := os.Getenv("PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid PORT %q: %w", v, err)
		}
		cfg.Port = p
	}

	if v := os.Getenv("ENVIRONMENT"); v != "" {
		cfg.Environment = v
	}
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		cfg.LogFormat = v
	}
	if v := os.Getenv("DATABASE_URL"); v != "" {
		cfg.DatabaseURL = v
	}
	if v := os.Getenv("CROSS_ENV_DATABASE_URL"); v != "" {
		cfg.CrossEnvDatabaseURL = v
	}
	if v := os.Getenv("WEBHOOK_ENCRYPTION_KEY"); v != "" {
		cfg.WebhookEncryptionKey = v
	}
	if v := os.Getenv("REDIS_URL"); v != "" {
		cfg.RedisURL = v
	}
	if v := os.Getenv("JWT_SECRET"); v != "" {
		cfg.JWTSecret = v
	}
	if v := os.Getenv("CORE_API_URL"); v != "" {
		cfg.CoreAPIURL = v
	}
	if v := os.Getenv("INTERNAL_API_KEY"); v != "" {
		cfg.InternalAPIKey = v
	}
	if cfg.CoreAPIURL == "" {
		cfg.CoreAPIURL = "http://127.0.0.1:8081"
	}
	if v := os.Getenv("OTLP_ENDPOINT"); v != "" {
		cfg.OTLPEndpoint = v
	}
	if v := os.Getenv("FIREBASE_CREDENTIALS_JSON"); v != "" {
		cfg.FirebaseCredentialsJSON = v
	}

	// KYB document storage (Track 3) — all optional; absence disables storage.
	if v := os.Getenv("KYB_STORAGE_PROVIDER"); v != "" {
		cfg.KYBStorageProvider = v
	}
	if v := os.Getenv("KYB_STORAGE_BUCKET"); v != "" {
		cfg.KYBStorageBucket = v
	}
	if v := os.Getenv("KYB_STORAGE_ENDPOINT"); v != "" {
		cfg.KYBStorageEndpoint = v
	}
	if v := os.Getenv("KYB_STORAGE_REGION"); v != "" {
		cfg.KYBStorageRegion = v
	}
	if v := os.Getenv("KYB_STORAGE_ACCESS_KEY_ID"); v != "" {
		cfg.KYBStorageAccessKeyID = v
	}
	if v := os.Getenv("KYB_STORAGE_SECRET_ACCESS_KEY"); v != "" {
		cfg.KYBStorageSecretKey = v
	}
	if v := os.Getenv("KYB_SIGNED_URL_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.KYBSignedURLTTLSeconds = n
		}
	}
	if v := os.Getenv("KYB_MAX_FILE_SIZE_BYTES"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			cfg.KYBMaxFileSizeBytes = n
		}
	}

	return cfg, nil
}

func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}
