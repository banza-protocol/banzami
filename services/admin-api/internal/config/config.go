package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the admin-api service.
type Config struct {
	Port        int
	CoreAPIURL  string
	AdminAPIKey string // secret required in every request via X-Admin-Key header
	LogLevel    string
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

	return &Config{
		Port:        port,
		CoreAPIURL:  coreURL,
		AdminAPIKey: adminKey,
		LogLevel:    os.Getenv("LOG_LEVEL"),
	}, nil
}
