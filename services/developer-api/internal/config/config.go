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
	// InternalAPIKey guards the service-to-service /internal/* routes (ADR-046
	// key introspection, called by the Gateway). Distinct from every developer
	// credential. Empty → the internal routes are not mounted (fail closed).
	InternalAPIKey string
	// SessionSecret backs opaque session-token generation/hashing. Empty →
	// sessions cannot be issued (fail closed).
	SessionSecret string

	// CoreAPIURL + CoreInternalKey are the outbound internal boundary to Core
	// (ADR-047 payee validation, RT04B §3). Distinct from InternalAPIKey (which
	// guards THIS service's inbound /internal routes). Empty → the payee validator
	// is not wired and operator binding fails closed.
	CoreAPIURL      string
	CoreInternalKey string

	SessionTTLHours int
	OTLPEndpoint    string // optional; tracing no-op when empty

	// Email (OTP delivery) — automated identity is used for OTP (noreply@).
	EmailProvider       string
	ResendAPIKey        string
	SMTPHost            string
	SMTPPort            int
	SMTPUser            string
	SMTPPassword        string
	EmailFromName       string
	EmailFromAddress    string
	EmailReplyTo        string
	EmailNoreplyName    string
	EmailNoreplyAddress string
	EmailDryRun         bool
}

// SecureCookies reports whether session cookies must be Secure + __Host- (any
// non-development environment, which is served over https).
func (c *Config) SecureCookies() bool { return c.Environment != "development" }

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
	if v := os.Getenv("DEVELOPER_INTERNAL_KEY"); v != "" {
		cfg.InternalAPIKey = v
	}
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		cfg.SessionSecret = v
	}
	if v := os.Getenv("CORE_API_URL"); v != "" {
		cfg.CoreAPIURL = v
	}
	if v := os.Getenv("CORE_INTERNAL_KEY"); v != "" {
		cfg.CoreInternalKey = v
	}
	if v := os.Getenv("SESSION_TTL_HOURS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.SessionTTLHours = n
		}
	}
	if v := os.Getenv("OTLP_ENDPOINT"); v != "" {
		cfg.OTLPEndpoint = v
	}

	// Email (OTP delivery)
	cfg.EmailFromName = "Banzami"
	cfg.EmailNoreplyName = "Banzami"
	if v := os.Getenv("EMAIL_PROVIDER"); v != "" {
		cfg.EmailProvider = v
	}
	if v := os.Getenv("RESEND_API_KEY"); v != "" {
		cfg.ResendAPIKey = v
	}
	if v := os.Getenv("SMTP_HOST"); v != "" {
		cfg.SMTPHost = v
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			cfg.SMTPPort = n
		}
	}
	if v := os.Getenv("SMTP_USER"); v != "" {
		cfg.SMTPUser = v
	}
	if v := os.Getenv("SMTP_PASSWORD"); v != "" {
		cfg.SMTPPassword = v
	}
	if v := os.Getenv("EMAIL_FROM_NAME"); v != "" {
		cfg.EmailFromName = v
	}
	if v := os.Getenv("EMAIL_FROM_ADDRESS"); v != "" {
		cfg.EmailFromAddress = v
	}
	if v := os.Getenv("EMAIL_REPLY_TO"); v != "" {
		cfg.EmailReplyTo = v
	}
	if v := os.Getenv("EMAIL_NOREPLY_ADDRESS"); v != "" {
		cfg.EmailNoreplyAddress = v
	}
	if os.Getenv("EMAIL_DRY_RUN") == "true" {
		cfg.EmailDryRun = true
	}

	return cfg, nil
}

func (c *Config) IsProduction() bool { return c.Environment == "production" }
