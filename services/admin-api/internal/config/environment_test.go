package config

import (
	"testing"
)

// The operator console must not call Sandbox data LIVE — and must not guess.
//
// The label was the literal "LIVE" in three places, then a LIVE default for an
// unset variable. Every number the console shows is a claim about money, and a
// stack that forgot ENVIRONMENT labelled Sandbox data as real and minted LIVE
// API keys for it. An unset or unrecognised value now refuses to load.
func TestEnvironment_IsRequiredAndCanonical(t *testing.T) {
	for _, bad := range []string{"", "  ", "PRODUCTION", "development"} {
		t.Setenv("ENVIRONMENT", bad)
		if _, err := Load(); err == nil {
			t.Fatalf("ENVIRONMENT=%q loaded; want a configuration error", bad)
		}
	}
	for in, want := range map[string]string{"sandbox": "SANDBOX", "SANDBOX": "SANDBOX", " sandbox ": "SANDBOX", "live": "LIVE", "LIVE": "LIVE"} {
		t.Setenv("ENVIRONMENT", in)
		cfg, err := Load()
		if err != nil {
			t.Fatalf("ENVIRONMENT=%q: %v", in, err)
		}
		if cfg.Environment != want {
			t.Fatalf("ENVIRONMENT=%q gave %q, want %q", in, cfg.Environment, want)
		}
	}
}
