package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the public-api service.
type Config struct {
	Port                    int
	CoreAPIURL              string
	DatabaseURL             string
	JWTSecret               string
	LogLevel                string
	LogFormat               string
	OTLPEndpoint            string // optional; tracing is a no-op when empty
	Environment             string // "PRODUCTION" or "SANDBOX"
	// FirebaseCredentialsJSON holds the Firebase service-account JSON (minified).
	// When empty, push notifications are silently disabled.
	FirebaseCredentialsJSON string

	// KYC consumer-evidence storage (Cloudflare R2 / S3-compatible). When any
	// required field is empty, KYC upload endpoints respond 503 instead of
	// failing startup — the rest of the API is unaffected.
	KycStorageProvider  string
	KycStorageBucket    string
	KycStorageEndpoint  string
	KycStorageRegion    string
	KycStorageAccessKey string
	KycStorageSecretKey string
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

	return &Config{
		FirebaseCredentialsJSON: os.Getenv("FIREBASE_CREDENTIALS_JSON"),
		KycStorageProvider:  os.Getenv("KYC_STORAGE_PROVIDER"),
		KycStorageBucket:    os.Getenv("KYC_STORAGE_BUCKET"),
		KycStorageEndpoint:  os.Getenv("KYC_STORAGE_ENDPOINT"),
		KycStorageRegion:    os.Getenv("KYC_STORAGE_REGION"),
		KycStorageAccessKey: os.Getenv("KYC_STORAGE_ACCESS_KEY_ID"),
		KycStorageSecretKey: os.Getenv("KYC_STORAGE_SECRET_ACCESS_KEY"),
		Port:         port,
		CoreAPIURL:   coreURL,
		DatabaseURL:  dbURL,
		JWTSecret:    jwtSecret,
		LogLevel:     logLevel,
		LogFormat:    logFormat,
		OTLPEndpoint: os.Getenv("OTLP_ENDPOINT"),
		Environment:  env,
	}, nil
}
