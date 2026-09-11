package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        int
	Environment string
	LogLevel    string
	LogFormat   string
	DatabaseURL string
	// CrossEnvDatabaseURL is an OPTIONAL read-only connection string to the OTHER
	// environment's database (LIVE stack → banzami_staging, SANDBOX stack →
	// banzami). Used only to detect "this @handle lives in the other environment"
	// for the login UX (ADR-025). Empty disables cross-env detection.
	CrossEnvDatabaseURL string
	RedisURL            string
	CoreAPIURL          string
	OTLPEndpoint        string // optional; tracing is a no-op when empty
	// JWTSecret is the HS256 signing key for merchant/session JWTs. It is
	// MANDATORY and validated at startup (see validateJWTSecret): an empty key
	// is a *valid* HMAC key, so booting without one would make every token
	// forgeable (SEC-001). The gateway refuses to start rather than fail open.
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

	// CoreInternalKey authenticates THIS gateway to Core's protected internal
	// route groups (refunds, F4). Sent as the X-Internal-Key header; Core verifies
	// it against CORE_INTERNAL_KEY. A DISTINCT credential from InternalAPIKey —
	// the gateway→Core boundary is separate from the admin-api→gateway boundary.
	CoreInternalKey string

	// DeveloperAPIURL + DeveloperInternalKey wire the ADR-046 external
	// developer-key path: the Gateway delegates key verification to developer-api
	// (the single key authority).
	DeveloperAPIURL      string
	DeveloperInternalKey string
	// DeveloperKeyAuthEnabled is the EXPLICIT activation flag (RT02.1). The
	// developer-key path (GET /v1/me) is mounted ONLY when this is true AND the
	// activation invariants hold (see DeveloperKeyAuthActive). A URL variable
	// alone must never activate developer-key authentication. Fail-closed.
	DeveloperKeyAuthEnabled bool

	// PayBaseURL is the origin of the hosted payer surface — pay.banzami.com
	// (Banzami ADR-052). It is what a payment session's PAYMENT_LINK interface
	// points at, and that value is the one a developer sends to a human.
	//
	// It has to be configured because the gateway cannot infer it: the gateway
	// serves /public/pay/{slug} itself, as JSON, for the payer app to consume.
	// Building the link from the request host therefore produced a URL that
	// returns a JSON document to anyone who opens it — correct for the app,
	// useless for the person meant to pay. Empty keeps that old behaviour and
	// logs a warning at startup rather than serving a broken link silently.
	PayBaseURL string

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

	// Required, with no default (as developer-api since RA-086). It defaulted to
	// "development", which reads as no environment at all: the Live start-up
	// refusals (no proof signing key, no webhook encryption key) and the
	// platform-mode guard switched off, and public onboarding took the
	// environment from the request body (A2-01). "development" must now be said.
	cfg.Environment = strings.TrimSpace(os.Getenv("ENVIRONMENT"))
	if cfg.Environment == "" {
		return nil, fmt.Errorf("ENVIRONMENT must be set (sandbox, live, or development for a local run)")
	}
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		cfg.LogFormat = v
	}
	if v := os.Getenv("PAY_BASE_URL"); v != "" {
		cfg.PayBaseURL = strings.TrimRight(v, "/")
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
	if v := os.Getenv("CORE_INTERNAL_KEY"); v != "" {
		cfg.CoreInternalKey = v
	}
	if v := os.Getenv("DEVELOPER_API_URL"); v != "" {
		cfg.DeveloperAPIURL = v
	}
	if v := os.Getenv("DEVELOPER_INTERNAL_KEY"); v != "" {
		cfg.DeveloperInternalKey = v
	}
	if v := os.Getenv("DEVELOPER_KEY_AUTH_ENABLED"); v == "true" || v == "1" {
		cfg.DeveloperKeyAuthEnabled = v == "true" || v == "1"
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

	if err := validateJWTSecret(cfg.JWTSecret); err != nil {
		return nil, err
	}

	return cfg, nil
}

// MinJWTSecretLen is the minimum accepted length for JWT_SECRET. The dev
// bootstrap (dev.sh) generates 64 hex characters; 32 is the floor below which an
// HS256 key is brute-forcible offline from a single captured token.
const MinJWTSecretLen = 32

// MinJWTSecretDistinctBytes is the crude entropy floor applied alongside the
// length minimum, to reject long-but-trivial keys ("aaaa…", a run of spaces).
const MinJWTSecretDistinctBytes = 8

// validateJWTSecret enforces the SEC-001 fail-closed contract for the gateway's
// signing key: it must be present and long enough. An empty JWT_SECRET makes
// every merchant JWT forgeable by anyone (HS256 accepts "" as a key), granting
// arbitrary merchant_id with scopes ["*"] in the LIVE environment. Config
// loading fails — and main() exits — rather than serving authenticated routes
// with a forgeable credential. The error never echoes the secret value.
func validateJWTSecret(secret string) error {
	if secret == "" {
		return fmt.Errorf("JWT_SECRET must be set: the gateway refuses to start without a signing key (an empty key makes every token forgeable)")
	}
	// Leading/trailing whitespace is almost always an accident of quoting in a
	// .env or compose file, and it silently changes which bytes are the key —
	// tokens minted before the stray space stop verifying after it. Reject it
	// explicitly rather than trimming, so the operator fixes the source.
	if strings.TrimSpace(secret) != secret {
		return fmt.Errorf("JWT_SECRET must not have leading or trailing whitespace")
	}
	if len(secret) < MinJWTSecretLen {
		return fmt.Errorf("JWT_SECRET is too short: %d characters, minimum %d", len(secret), MinJWTSecretLen)
	}
	// Length alone is not strength: a run of spaces or a repeated character
	// clears the length floor while remaining trivially guessable. Require a
	// minimum number of DISTINCT bytes. `openssl rand -hex 32`, which the
	// documented setup command produces, yields ~16 distinct characters, so this
	// floor never rejects a properly generated key.
	distinct := map[byte]struct{}{}
	for i := 0; i < len(secret); i++ {
		distinct[secret[i]] = struct{}{}
	}
	if len(distinct) < MinJWTSecretDistinctBytes {
		return fmt.Errorf("JWT_SECRET is too low-entropy: %d distinct characters, minimum %d — generate one with `openssl rand -hex 32`",
			len(distinct), MinJWTSecretDistinctBytes)
	}
	return nil
}

func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

// DeveloperKeyAuthActive reports whether the ADR-046 developer-key path (GET
// /v1/me) may be mounted. Fail-closed activation (RT02.1): every invariant must
// hold. The returned reason is safe to log (no secrets). A URL variable alone is
// NEVER sufficient — DeveloperKeyAuthEnabled must be explicitly set.
func (c *Config) DeveloperKeyAuthActive() (bool, string) {
	if !c.DeveloperKeyAuthEnabled {
		return false, "DEVELOPER_KEY_AUTH_ENABLED not set — developer-key path disabled"
	}
	// SANDBOX only. Developer-key auth must never activate on a Live-mode path
	// unless a separate future Live activation gate explicitly enables it.
	if !strings.EqualFold(c.Environment, "SANDBOX") {
		return false, "developer-key auth requires ENVIRONMENT=SANDBOX"
	}
	if c.DeveloperInternalKey == "" {
		return false, "DEVELOPER_INTERNAL_KEY is empty"
	}
	u, err := url.Parse(c.DeveloperAPIURL)
	if err != nil || u.Host == "" {
		return false, "DEVELOPER_API_URL is missing or malformed"
	}
	// Canonical Sandbox Developer API host only: an internal service host, never
	// a public/live/arbitrary host. Accept the in-cluster name or the sandbox
	// developer-api hostname; reject anything else (SSRF / wrong-host guard).
	host := strings.ToLower(u.Hostname())
	okHost := host == "developer-api" || host == "developer-api.banzami.com" ||
		host == "localhost" || host == "127.0.0.1"
	if !okHost {
		return false, "DEVELOPER_API_URL host is not the canonical Sandbox Developer API"
	}
	return true, "active"
}
