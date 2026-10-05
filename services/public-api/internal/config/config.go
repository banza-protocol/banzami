package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/banzami/banzami/services/common/clientip"
)

// Config holds all runtime configuration for the public-api service.
type Config struct {
	Port         int
	CoreAPIURL   string
	DatabaseURL  string
	JWTSecret    string
	LogLevel     string
	LogFormat    string
	OTLPEndpoint string // optional; tracing is a no-op when empty
	Environment  string // "PRODUCTION" or "SANDBOX"
	// FirebaseCredentialsJSON holds the Firebase service-account JSON (minified).
	// When empty, push notifications are silently disabled.
	FirebaseCredentialsJSON string
	// PushTopicKey (PUSH_TOPIC_KEY) keys the FCM topic names (A6-06,
	// services/common/pushtopic). The gateway must hold the same value. When
	// empty or shorter than 32 bytes, topic pushes are skipped.
	PushTopicKey string

	// KYC consumer-evidence storage (Cloudflare R2 / S3-compatible). When any
	// required field is empty, KYC upload endpoints respond 503 instead of
	// failing startup — the rest of the API is unaffected.
	KycStorageProvider  string
	KycStorageBucket    string
	KycStorageEndpoint  string
	KycStorageRegion    string
	KycStorageAccessKey string
	KycStorageSecretKey string

	// GatewayInternalURL + InternalAPIKey let public-api ask the gateway to mint a
	// transaction proof for a receipt (the gateway owns proof generation + the
	// signing key — ADR-040/ADR-025). When empty, receipts fall back to a derived
	// reference (the QR still renders, but resolves only once a proof exists).
	GatewayInternalURL string
	InternalAPIKey     string
	// CoreInternalKey authenticates this service to Core (X-Internal-Key).
	CoreInternalKey string

	// Email delivery (Resend / SMTP via services/common/email). When unset, the
	// email-verification and PIN-recovery endpoints respond 503 rather than
	// failing startup. Mirrors the api-gateway env var names so ops config is
	// uniform.
	EmailProvider       string
	EmailDryRun         bool
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

	// OTPPepper is the HMAC pepper for the Consumer email-verification and
	// PIN-reset OTP codes (OTP_PEPPER, shared env name). Never stored in
	// Postgres. Empty disables those flows (fail-closed).
	OTPPepper string

	// RateLimitPepper is a SEPARATE, dedicated HMAC secret for hashing login
	// sources (IPs) and targets in the persistent abuse throttle. It is wholly
	// distinct from the OTP pepper (separate responsibilities: OTP_PEPPER hashes
	// OTP codes, RATE_LIMIT_PEPPER hashes throttle keys) and MUST be configured
	// explicitly (RATE_LIMIT_PEPPER). There is NO derivation from OTP_PEPPER and
	// no empty fallback: a missing secret is a hard boot failure (see
	// MissingLaunchSecrets / main), never a silently disabled throttle.
	RateLimitPepper string

	// ClientIP decides who the client is for the per-IP limits and log lines:
	// the edge's X-Real-IP, believed only from TRUSTED_PROXY_CIDRS (A9-09). Nil
	// trusts no proxy — the client is the direct peer.
	ClientIP *clientip.Resolver
}

// Load reads config from environment variables.
func Load() (*Config, error) {
	port := 8083
	if raw := os.Getenv("PUBLIC_API_PORT"); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil {
			return nil, fmt.Errorf("PUBLIC_API_PORT must be an integer: %w", err)
		}
		port = p
	}

	coreURL := os.Getenv("CORE_API_URL")
	if coreURL == "" {
		coreURL = "http://127.0.0.1:8081"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL must be set")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET must be set")
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}
	logFormat := os.Getenv("LOG_FORMAT")
	if logFormat == "" {
		logFormat = "json"
	}

	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = "PRODUCTION"
	}

	// A malformed trust list refuses to start rather than guess.
	clientIP, err := clientip.LoadEdge()
	if err != nil {
		return nil, err
	}

	return &Config{
		ClientIP:                clientIP,
		FirebaseCredentialsJSON: os.Getenv("FIREBASE_CREDENTIALS_JSON"),
		PushTopicKey:            os.Getenv("PUSH_TOPIC_KEY"),
		KycStorageProvider:      os.Getenv("KYC_STORAGE_PROVIDER"),
		KycStorageBucket:        os.Getenv("KYC_STORAGE_BUCKET"),
		KycStorageEndpoint:      os.Getenv("KYC_STORAGE_ENDPOINT"),
		KycStorageRegion:        os.Getenv("KYC_STORAGE_REGION"),
		KycStorageAccessKey:     os.Getenv("KYC_STORAGE_ACCESS_KEY_ID"),
		KycStorageSecretKey:     os.Getenv("KYC_STORAGE_SECRET_ACCESS_KEY"),
		Port:                    port,
		CoreAPIURL:              coreURL,
		DatabaseURL:             dbURL,
		JWTSecret:               jwtSecret,
		LogLevel:                logLevel,
		LogFormat:               logFormat,
		OTLPEndpoint:            os.Getenv("OTLP_ENDPOINT"),
		Environment:             env,
		GatewayInternalURL:      os.Getenv("GATEWAY_INTERNAL_URL"),
		InternalAPIKey:          os.Getenv("INTERNAL_API_KEY"),
		CoreInternalKey:         os.Getenv("CORE_INTERNAL_KEY"),
		EmailProvider:           os.Getenv("EMAIL_PROVIDER"),
		EmailDryRun:             os.Getenv("EMAIL_DRY_RUN") == "true" || os.Getenv("EMAIL_DRY_RUN") == "1",
		ResendAPIKey:            os.Getenv("RESEND_API_KEY"),
		SMTPHost:                os.Getenv("SMTP_HOST"),
		SMTPPort:                atoiOr(os.Getenv("SMTP_PORT"), 587),
		SMTPUser:                os.Getenv("SMTP_USER"),
		SMTPPassword:            os.Getenv("SMTP_PASSWORD"),
		EmailFromName:           os.Getenv("EMAIL_FROM_NAME"),
		EmailFromAddress:        os.Getenv("EMAIL_FROM_ADDRESS"),
		EmailReplyTo:            os.Getenv("EMAIL_REPLY_TO"),
		EmailNoreplyName:        os.Getenv("EMAIL_NOREPLY_NAME"),
		EmailNoreplyAddress:     os.Getenv("EMAIL_NOREPLY_ADDRESS"),
		OTPPepper:               os.Getenv("OTP_PEPPER"),
		RateLimitPepper:         os.Getenv("RATE_LIMIT_PEPPER"),
	}, nil
}

// RateLimitSecret returns the secret for hashing throttle keys. It is the
// dedicated RATE_LIMIT_PEPPER and NOTHING else — there is deliberately no
// derivation from OTP_PEPPER and no other fallback. The two secrets have
// separate responsibilities (OTP_PEPPER hashes OTP codes; RATE_LIMIT_PEPPER
// hashes source/target throttle keys) and are configured independently.
//
// An empty result means the login-abuse throttle has no secret. This is NOT a
// degraded-but-running mode: the service refuses to boot in that state (see
// MissingLaunchSecrets and cmd/public-api/main.go), and the throttle
// constructor refuses to build a keyless throttle. The protection can therefore
// never be silently disabled, nor quietly satisfied by the OTP pepper.
func (c *Config) RateLimitSecret() string {
	return strings.TrimSpace(c.RateLimitPepper)
}

// RateLimitConfigured reports whether a non-empty throttle secret is available.
// False is a hard misconfiguration for a running service (the login-abuse
// throttle would have no secret), not an acceptable degraded mode.
func (c *Config) RateLimitConfigured() bool {
	return c.RateLimitSecret() != ""
}

// emailConfigured mirrors (coarsely) services/common/email.Sender.Enabled: a
// transport (Resend or SMTP) plus the institutional from/noreply addresses.
func (c *Config) emailConfigured() bool {
	transport := strings.TrimSpace(c.ResendAPIKey) != "" || strings.TrimSpace(c.SMTPHost) != ""
	return transport && strings.TrimSpace(c.EmailFromAddress) != "" && strings.TrimSpace(c.EmailNoreplyAddress) != ""
}

// MissingLaunchSecrets returns the human-readable names of the mandatory
// public-launch secrets that are not configured. An empty slice means the
// environment is configured for a public launch. The names are config keys,
// never the secret values — this result is safe to log.
//
// Two tiers of consequence (see main): a missing RATE_LIMIT secret is a HARD
// boot failure (an auth protection cannot be silently disabled); a missing
// OTP_PEPPER or email config fails the dependent flows closed (signup +
// recovery → 503) while existing sign-in keeps working. Either way the
// environment is NOT ready for a public launch until all are set.
func (c *Config) MissingLaunchSecrets() []string {
	var missing []string
	if strings.TrimSpace(c.OTPPepper) == "" {
		missing = append(missing, "OTP_PEPPER")
	}
	if !c.RateLimitConfigured() {
		missing = append(missing, "RATE_LIMIT_PEPPER")
	}
	if !c.emailConfigured() {
		missing = append(missing, "RESEND_API_KEY/EMAIL_* (sender config)")
	}
	return missing
}

// IsSandbox reports whether this stack is the Sandbox environment. Used to gate
// test-only affordances (e.g. returning an OTP in a response), never a request
// field. Anything other than the literal PRODUCTION is treated as Sandbox.
func (c *Config) IsSandbox() bool {
	return c.Environment != "PRODUCTION"
}

func atoiOr(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}
