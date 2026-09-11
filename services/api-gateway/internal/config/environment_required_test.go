package config

import (
	"strings"
	"testing"
)

// A2-01. The gateway defaulted ENVIRONMENT to "development", which reads as no
// environment: the Live start-up refusals and the platform-mode guard switched
// off. It must be declared, as developer-api's must (RA-086).
func TestLoad_RefusesToStartWithoutAnEnvironment(t *testing.T) {
	for _, v := range []string{"", "   "} {
		t.Setenv("ENVIRONMENT", v)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "ENVIRONMENT") {
			t.Fatalf("ENVIRONMENT=%q: want a refusal naming ENVIRONMENT, got %v", v, err)
		}
	}
}
