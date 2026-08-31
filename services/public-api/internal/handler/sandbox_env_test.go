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

// The registration test-balance grant uses the same helper. It was written as an
// exact match against "SANDBOX" while deployments set "sandbox", so every Sandbox
// consumer registered with a zero balance — silently, because a skipped grant is
// indistinguishable from a grant of nothing. Both call sites now share one
// predicate so they cannot drift apart again.
func TestIsSandboxEnvironment_SharedByGrantAndUtilities(t *testing.T) {
	if !isSandboxEnvironment("sandbox") {
		t.Fatal("the deployed spelling must enable the registration test-balance grant")
	}
	if isSandboxEnvironment("production") {
		t.Fatal("a production deployment must never auto-credit a consumer wallet")
	}
}
