package config

import (
	"fmt"
	"os"
	"strconv"
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

	return &Config{
		Port:         port,
		CoreAPIURL:   coreURL,
		DatabaseURL:  dbURL,
		JWTSecret:    jwtSecret,
		LogLevel:     logLevel,
		LogFormat:    logFormat,
		OTLPEndpoint: os.Getenv("OTLP_ENDPOINT"),
	}, nil
}
