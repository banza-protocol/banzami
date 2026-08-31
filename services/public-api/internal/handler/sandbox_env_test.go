package handler

import "testing"

// The deployment sets ENVIRONMENT=sandbox; the gate demanded "SANDBOX", so the
// Sandbox refused its own Sandbox-only endpoints with
// "403 SANDBOX_ONLY: only available in sandbox mode".
func TestIsSandboxEnvironment_AcceptsDeployedSpelling(t *testing.T) {
	for _, env := range []string{"sandbox", "SANDBOX", "Sandbox"} {
		if !isSandboxEnvironment(env) {
			t.Errorf("%q must be recognised as sandbox — it is what deployments set", env)
		}
	}
}

// The safety half: anything that is not the word "sandbox" must keep failing.
// Exact equality after folding case, never a prefix or substring match.
func TestIsSandboxEnvironment_RejectsEverythingElse(t *testing.T) {
	for _, env := range []string{
		"production", "PRODUCTION", "live", "LIVE", "staging", "development", "",
		"sandbox-live", // substring match would wrongly accept this
		"presandbox",   // and this
		"not-sandbox",  // and this
	} {
		if isSandboxEnvironment(env) {
			t.Errorf("%q must NOT enable sandbox-only endpoints", env)
		}
	}
}
