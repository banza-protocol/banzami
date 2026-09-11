package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/banzami/banzami/services/common/clientip"
	banzamienv "github.com/banzami/banzami/services/common/env"
)

// Config holds all runtime configuration for the admin-api service.
type Config struct {
	// Environment labels the PRIMARY database this deployment is pointed at.
	//
	// It used to be the literal "LIVE" in three places, which was true while the
	// only deployment was the live one. On a Sandbox-only stack the primary pool
	// is banzami_staging, and a console that labels Sandbox data LIVE is worse
	// than one that shows nothing: every number on it is a claim about real
	// money. Set ENVIRONMENT=SANDBOX there.
	Environment string

	// WebhookEncryptionKey encrypts operator MFA secrets at rest. Named for the
	// variable the rest of the platform already uses so a deployment holds ONE
	// key rather than one per feature — the gateway encrypts webhook signing
	// secrets with the same value.
	WebhookEncryptionKey string
	Port                 int
	CoreAPIURL           string
	AdminAPIKey          string // secret required in every request via X-Admin-Key header
	LogLevel             string
	LogFormat            string
	OTLPEndpoint         string // optional; tracing is a no-op when empty

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
	// CoreInternalKey authenticates this service to Core (X-Internal-Key).
	CoreInternalKey string
	// Optional: lets the (live) portal review SANDBOX merchant KYB documents by
	// forwarding to the staging gateway. Absent → the SANDBOX toggle is disabled.
	GatewayStagingInternalURL string // e.g. http://api-gateway-staging:8080
	StagingInternalAPIKey     string
	// WebsiteBaseURL builds the activation link (e.g. https://banzami.com).
	WebsiteBaseURL string

	// Operator auth (admin_users + admin JWT). DatabaseURL connects to the
	// shared Postgres; AdminJWTSecret signs the operator JWT.
	DatabaseURL string
	// StagingDatabaseURL optionally connects to the sandbox database (banzami_staging)
	// so the operator can review SANDBOX consumer-KYC cases. Optional: when unset,
	// the SANDBOX environment toggle for KYC responds 503 (live review still works).
	StagingDatabaseURL string
	AdminJWTSecret     string
	// AdminBaseURL is the BANZADMIN front-end origin, used to build
	// password-reset links (e.g. https://admin.banzami.com).
	AdminBaseURL string

	// KYC consumer-evidence storage (same R2 bucket as public-api). Used only to
	// mint short-lived signed download URLs for evidence review. Optional.
	KycStorageProvider  string
	KycStorageBucket    string
	KycStorageEndpoint  string
	KycStorageRegion    string
	KycStorageAccessKey string
	KycStorageSecretKey string

	// Sandbox KYC storage (bucket banzami-kyc-sandbox). Used ONLY to sign SANDBOX
	// evidence — never touches the live bucket. Credentials/endpoint fall back to
	// the live KYC values (same R2 account can read both buckets); set the
	// KYC_SANDBOX_STORAGE_* envs to override. Optional.
	KycSandboxStorageProvider  string
	KycSandboxStorageBucket    string
	KycSandboxStorageEndpoint  string
	KycSandboxStorageRegion    string
	KycSandboxStorageAccessKey string
	KycSandboxStorageSecretKey string

	// ClientIP decides who the client is for the per-IP auth limit, the audit
	// log and login attempts: the edge's X-Real-IP, believed only from
	// TRUSTED_PROXY_CIDRS (A9-09). Nil trusts no proxy — the direct peer.
	ClientIP *clientip.Resolver
}

// Load reads config from environment variables.
// Missing required values cause an error.
func Load() (*Config, error) {
	// The primary database's environment label, required. It used to default to
	// LIVE "so an existing live deployment behaves exactly as before" — which
	// meant a stack that forgot the variable labelled Sandbox data as real money
	// and minted API keys for it as LIVE. Every deployment sets it; a missing or
	// unrecognised value is a configuration error, not a guess.
	environment := banzamienv.Parse(os.Getenv("ENVIRONMENT"))
	if !environment.IsKnown() {
		return nil, fmt.Errorf("ENVIRONMENT must be SANDBOX or LIVE (got %q)", strings.TrimSpace(os.Getenv("ENVIRONMENT")))
	}

	port := 8082
	if raw := os.Getenv("ADMIN_API_PORT"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil {
			return nil, fmt.Errorf("ADMIN_API_PORT must be an integer: %w", err)
		}
		port = p
	}

	webhookKey := os.Getenv("WEBHOOK_ENCRYPTION_KEY")

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

	// A malformed trust list refuses to start rather than guess.
	clientIP, err := clientip.LoadEdge()
	if err != nil {
		return nil, err
	}

	return &Config{
		ClientIP:             clientIP,
		Environment:          environment.String(),
		WebhookEncryptionKey: webhookKey,
		Port:                 port,
		CoreAPIURL:           coreURL,
		AdminAPIKey:          adminKey,
		LogLevel:             logLevel,
		LogFormat:            logFormat,
		OTLPEndpoint:         os.Getenv("OTLP_ENDPOINT"),

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
		EmailDryRun:               os.Getenv("EMAIL_DRY_RUN") != "false",
		GatewayInternalURL:        getenvDefault("GATEWAY_INTERNAL_URL", "http://api-gateway:8080"),
		InternalAPIKey:            os.Getenv("INTERNAL_API_KEY"),
		CoreInternalKey:           os.Getenv("CORE_INTERNAL_KEY"),
		GatewayStagingInternalURL: os.Getenv("GATEWAY_STAGING_INTERNAL_URL"),
		StagingInternalAPIKey:     os.Getenv("STAGING_INTERNAL_API_KEY"),
		WebsiteBaseURL:            getenvDefault("WEBSITE_BASE_URL", "https://banzami.com"),
		DatabaseURL:               os.Getenv("DATABASE_URL"),
		StagingDatabaseURL:        os.Getenv("STAGING_DATABASE_URL"),
		AdminJWTSecret:            os.Getenv("ADMIN_JWT_SECRET"),
		AdminBaseURL:              getenvDefault("ADMIN_BASE_URL", "https://admin.banzami.com"),
		KycStorageProvider:        os.Getenv("KYC_STORAGE_PROVIDER"),
		KycStorageBucket:          os.Getenv("KYC_STORAGE_BUCKET"),
		KycStorageEndpoint:        os.Getenv("KYC_STORAGE_ENDPOINT"),
		KycStorageRegion:          os.Getenv("KYC_STORAGE_REGION"),
		KycStorageAccessKey:       os.Getenv("KYC_STORAGE_ACCESS_KEY_ID"),
		KycStorageSecretKey:       os.Getenv("KYC_STORAGE_SECRET_ACCESS_KEY"),

		// Sandbox KYC storage: sandbox bucket + live creds fallback.
		KycSandboxStorageProvider:  getenvDefault("KYC_SANDBOX_STORAGE_PROVIDER", os.Getenv("KYC_STORAGE_PROVIDER")),
		KycSandboxStorageBucket:    getenvDefault("KYC_SANDBOX_STORAGE_BUCKET", "banzami-kyc-sandbox"),
		KycSandboxStorageEndpoint:  getenvDefault("KYC_SANDBOX_STORAGE_ENDPOINT", os.Getenv("KYC_STORAGE_ENDPOINT")),
		KycSandboxStorageRegion:    getenvDefault("KYC_SANDBOX_STORAGE_REGION", os.Getenv("KYC_STORAGE_REGION")),
		KycSandboxStorageAccessKey: getenvDefault("KYC_SANDBOX_STORAGE_ACCESS_KEY_ID", os.Getenv("KYC_STORAGE_ACCESS_KEY_ID")),
		KycSandboxStorageSecretKey: getenvDefault("KYC_SANDBOX_STORAGE_SECRET_ACCESS_KEY", os.Getenv("KYC_STORAGE_SECRET_ACCESS_KEY")),
	}, nil
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
