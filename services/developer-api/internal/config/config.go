package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config for the Developer Platform management API (developer-api.banzami.com,
// ADR-033). Sandbox-specific values (DATABASE_URL, REDIS_URL, OTP_PEPPER,
// API_KEY_PEPPER, session secret) are supplied per environment and must never be
// shared with production — sandbox has no route to production data or rails.
type Config struct {
	Port        int
	Environment string // "development" | "sandbox" | "production"
	LogLevel    string
	LogFormat   string

	DatabaseURL string
	RedisURL    string

	// ConsoleOrigin is the single credentialed CORS origin — the Developer
	// Console frontend. Never a wildcard. State-changing endpoints also enforce
	// an Origin check against this value.
	ConsoleOrigin string

	// OTPPepper is the environment-specific HMAC pepper for OTP codes. It is
	// NEVER stored in PostgreSQL. Empty → OTP issuing is disabled (fail closed).
	OTPPepper string
	// APIKeyPepper is the environment-specific HMAC pepper for secret API keys.
	// NEVER stored in PostgreSQL. Empty → secret-key creation is disabled.
	APIKeyPepper string
	// SessionSecret backs opaque session-token generation/hashing. Empty →
	// sessions cannot be issued (fail closed).
	SessionSecret string

	SessionTTLHours int
	OTLPEndpoint    string // optional; tracing no-op when empty
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:            8086,
		Environment:     "development",
		LogLevel:        "info",
		LogFormat:       "json",
		ConsoleOrigin:   "https://developers.banzami.com",
		SessionTTLHours: 720, // 30 days
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
	if v := os.Getenv("REDIS_URL"); v != "" {
		cfg.RedisURL = v
	}
	if v := os.Getenv("CONSOLE_ORIGIN"); v != "" {
		cfg.ConsoleOrigin = v
	}
	if v := os.Getenv("OTP_PEPPER"); v != "" {
		cfg.OTPPepper = v
	}
	if v := os.Getenv("API_KEY_PEPPER"); v != "" {
		cfg.APIKeyPepper = v
	}
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		cfg.SessionSecret = v
	}
	if v := os.Getenv("SESSION_TTL_HOURS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.SessionTTLHours = n
		}
	}
	if v := os.Getenv("OTLP_ENDPOINT"); v != "" {
		cfg.OTLPEndpoint = v
	}

	return cfg, nil
}

func (c *Config) IsProduction() bool { return c.Environment == "production" }
