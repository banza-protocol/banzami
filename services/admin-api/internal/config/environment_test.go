package config

import (
	"os"
	"testing"
)

// The operator console must not call Sandbox data LIVE.
//
// The environment label was the literal "LIVE" in three places, which was true
// while the only deployment was the live one. On a Sandbox-only stack the
// primary database is banzami_staging, and every number the console shows is a
// claim about money — a wrong label there is not cosmetic.
func TestEnvironment_DefaultsToLiveAndIsOverridable(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Environment != "LIVE" {
		// An existing live deployment sets nothing and must keep behaving as before.
		t.Fatalf("default environment = %q, want LIVE", cfg.Environment)
	}

	for in, want := range map[string]string{"sandbox": "SANDBOX", "SANDBOX": "SANDBOX", " sandbox ": "SANDBOX"} {
		if err := os.Setenv("ENVIRONMENT", in); err != nil {
			t.Fatal(err)
		}
		cfg, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if cfg.Environment != want {
			t.Fatalf("ENVIRONMENT=%q gave %q, want %q", in, cfg.Environment, want)
		}
	}
}
