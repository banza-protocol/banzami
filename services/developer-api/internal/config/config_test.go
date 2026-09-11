package config

import (
	"testing"

	"github.com/banzami/banzami/services/common/env"
)

// The Sandbox privileges are switched on by ENVIRONMENT=sandbox or an explicit
// "development"; a missing variable must stop the process, never pick one.
func TestLoad_RequiresEnvironment(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")
	if cfg, err := Load(); err == nil {
		t.Fatalf("an unset ENVIRONMENT must refuse to start, got %q", cfg.Environment)
	}
	t.Setenv("ENVIRONMENT", "   ")
	if _, err := Load(); err == nil {
		t.Fatal("a blank ENVIRONMENT must refuse to start")
	}
}

func TestLoad_KeepsTheConfiguredEnvironment(t *testing.T) {
	t.Setenv("ENVIRONMENT", "live")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.IsDevelopment() || env.Parse(cfg.Environment).IsSandbox() {
		t.Fatalf("live must not carry Sandbox privileges: %q", cfg.Environment)
	}
	if !cfg.SecureCookies() {
		t.Fatal("live cookies must be Secure")
	}
}
