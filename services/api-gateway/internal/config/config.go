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
	RedisURL     string
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
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:        8080,
		Environment: "development",
		LogLevel:    "info",
		LogFormat:   "json",
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

	return cfg, nil
}

func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}
