package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the admin-api service.
type Config struct {
	Port         int
	CoreAPIURL   string
	AdminAPIKey  string // secret required in every request via X-Admin-Key header
	LogLevel     string
	LogFormat    string
	OTLPEndpoint string // optional; tracing is a no-op when empty

	// SMTP — optional; email is skipped when Host is empty.
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	SMTPFromName string
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

	adminKey := os.Getenv("ADMIN_API_KEY")
	if adminKey == "" {
		return nil, fmt.Errorf("ADMIN_API_KEY must be set")
	}

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

	smtpFromName := os.Getenv("SMTP_FROM_NAME")
	if smtpFromName == "" {
		smtpFromName = "Banzami"
	}

	return &Config{
		Port:         port,
		CoreAPIURL:   coreURL,
		AdminAPIKey:  adminKey,
		LogLevel:     logLevel,
		LogFormat:    logFormat,
		OTLPEndpoint: os.Getenv("OTLP_ENDPOINT"),

		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     smtpPort,
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		SMTPFromName: smtpFromName,
	}, nil
}
