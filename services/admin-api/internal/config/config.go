package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all runtime configuration for the admin-api service.
type Config struct {
	Port         int
	CoreAPIURL   string
	AdminAPIKey  string // secret required in every request via X-Admin-Key header
	LogLevel     string
	LogFormat    string
	OTLPEndpoint string // optional; tracing is a no-op when empty

	// Email provider — "resend" (HTTP API) or "smtp". Defaults to "resend" when
	// RESEND_API_KEY is set, otherwise "smtp".
	EmailProvider string
	ResendAPIKey  string

	// SMTP — optional legacy transport; used only when EmailProvider == "smtp".
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string

	// Institutional sender (contact@) — replyable mail.
	EmailFromName    string
	EmailFromAddress string
	EmailReplyTo     string
	// Automated sender (noreply@) — security/automatic mail.
	EmailNoreplyName    string
	EmailNoreplyAddress string

	// EmailDryRun logs emails instead of sending them. Defaults to TRUE (safe):
	// real emails are sent only when EMAIL_DRY_RUN=false is set explicitly.
	EmailDryRun bool

	// Gateway internal API — for the merchant-application orchestration.
	GatewayInternalURL string // e.g. http://api-gateway:8080
	InternalAPIKey     string // shared secret sent as X-Internal-Key
	// WebsiteBaseURL builds the activation link (e.g. https://banzami.com).
	WebsiteBaseURL string

	// Operator auth (admin_users + admin JWT). DatabaseURL connects to the
	// shared Postgres; AdminJWTSecret signs the operator JWT.
	DatabaseURL    string
	AdminJWTSecret string
	// AdminBaseURL is the BANZADMIN front-end origin, used to build
	// password-reset links (e.g. https://admin.banzami.com).
	AdminBaseURL string
}

// Load reads config from environment variables.
// Missing required values cause an error.
func Load() (*Config, error) {
	port := 8082
	if raw := os.Getenv("ADMIN_API_PORT"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil {
			return nil, fmt.Errorf("ADMIN_API_PORT must be an integer: %w", err)
		}
		port = p
	}

	coreURL := os.Getenv("CORE_API_URL")
	if coreURL == "" {
		coreURL = "http://127.0.0.1:8081"
	}

	// ADMIN_API_KEY is now LEGACY — it no longer authenticates the portal (the
	// admin uses per-operator email/password + JWT). Kept optional so existing
	// server env doesn't break startup; slated for removal.
	adminKey := os.Getenv("ADMIN_API_KEY")

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}
	logFormat := os.Getenv("LOG_FORMAT")
	if logFormat == "" {
		logFormat = "json"
	}

	smtpPort := 587
	if raw := os.Getenv("SMTP_PORT"); raw != "" {
		if p, err := strconv.Atoi(raw); err == nil {
			smtpPort = p
		}
	}

	// Email provider selection: explicit EMAIL_PROVIDER wins; otherwise infer
	// from RESEND_API_KEY presence.
	resendKey := os.Getenv("RESEND_API_KEY")
	emailProvider := strings.ToLower(strings.TrimSpace(os.Getenv("EMAIL_PROVIDER")))
	if emailProvider == "" {
		if resendKey != "" {
			emailProvider = "resend"
		} else {
			emailProvider = "smtp"
		}
	}

	// Sender identities. New EMAIL_FROM_* vars win; fall back to legacy SMTP_FROM*
	// then to the institutional defaults.
	fromName := getenvDefault("EMAIL_FROM_NAME", getenvDefault("SMTP_FROM_NAME", "Banzami"))
	fromAddress := getenvDefault("EMAIL_FROM_ADDRESS", getenvDefault("SMTP_FROM", "contact@banzami.com"))
	replyTo := getenvDefault("EMAIL_REPLY_TO", fromAddress)
	noreplyName := getenvDefault("EMAIL_NOREPLY_NAME", fromName)
	noreplyAddress := getenvDefault("EMAIL_NOREPLY_ADDRESS", "noreply@banzami.com")

	return &Config{
		Port:         port,
		CoreAPIURL:   coreURL,
		AdminAPIKey:  adminKey,
		LogLevel:     logLevel,
		LogFormat:    logFormat,
		OTLPEndpoint: os.Getenv("OTLP_ENDPOINT"),

		EmailProvider: emailProvider,
		ResendAPIKey:  resendKey,

		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     smtpPort,
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),

		EmailFromName:       fromName,
		EmailFromAddress:    fromAddress,
		EmailReplyTo:        replyTo,
		EmailNoreplyName:    noreplyName,
		EmailNoreplyAddress: noreplyAddress,

		// Dry-run is the safe default; only EMAIL_DRY_RUN=false enables real sends.
		EmailDryRun:        os.Getenv("EMAIL_DRY_RUN") != "false",
		GatewayInternalURL: getenvDefault("GATEWAY_INTERNAL_URL", "http://api-gateway:8080"),
		InternalAPIKey:     os.Getenv("INTERNAL_API_KEY"),
		WebsiteBaseURL:     getenvDefault("WEBSITE_BASE_URL", "https://banzami.com"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		AdminJWTSecret:     os.Getenv("ADMIN_JWT_SECRET"),
		AdminBaseURL:       getenvDefault("ADMIN_BASE_URL", "https://admin.banzami.com"),
	}, nil
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
