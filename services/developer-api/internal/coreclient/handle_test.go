package coreclient

import "testing"

// The handle is derived, never chosen. A caller-chosen handle is a caller-chosen
// identity, and @banza is a scarce public namespace: a developer naming their
// Sandbox Business "banco" or "bna" would reserve it.
//
// The registry requires 3–20 characters, lowercase letters, digits and
// underscores, starting with a letter and not ending in one.
func TestDeriveSandboxHandle(t *testing.T) {
	cases := []string{
		"40d24abd-6e69-4e50-bee4-9b582b5d0de6",
		"84b0e8e6-fbda-417e-a537-19ad8574827a",
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-ffff-ffff-ffff-ffffffffffff",
		"AB", // short and uppercase — still must produce a valid handle
		"",   // absent — must not produce something the registry rejects
	}
	seen := map[string]string{}
	for _, id := range cases {
		h := DeriveSandboxHandle(id)
		if n := len(h); n < 3 || n > 20 {
			t.Errorf("%q → %q: length %d outside the registry's 3..20", id, h, n)
		}
		if h[0] < 'a' || h[0] > 'z' {
			t.Errorf("%q → %q: must start with a lowercase letter", id, h)
		}
		if h[len(h)-1] == '_' {
			t.Errorf("%q → %q: must not end with an underscore", id, h)
		}
		for i := 0; i < len(h); i++ {
			c := h[i]
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_') {
				t.Errorf("%q → %q: byte %d (%q) is outside [a-z0-9_]", id, h, i, string(c))
			}
		}
		if prev, dup := seen[h]; dup && prev != id {
			t.Errorf("%q and %q both derive %q — two Businesses would contend for one identity",
				prev, id, h)
		}
		seen[h] = id
	}
}

func TestDeriveSandboxHandle_IsDeterministic(t *testing.T) {
	// A retry must ask for the same handle, or resumable provisioning would
	// register a second identity for the same Business.
	const id = "40d24abd-6e69-4e50-bee4-9b582b5d0de6"
	first := DeriveSandboxHandle(id)
	for i := 0; i < 5; i++ {
		if got := DeriveSandboxHandle(id); got != first {
			t.Fatalf("derivation %d = %q, want %q — a retry would claim a different handle", i, got, first)
		}
	}
}

func TestDeriveSandboxHandle_CarriesNoWords(t *testing.T) {
	// Hex only, so a derived handle can never collide with a name someone would
	// want, or read as an endorsement.
	h := DeriveSandboxHandle("84b0e8e6-fbda-417e-a537-19ad8574827a")
	for i := 1; i < len(h); i++ {
		c := h[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			t.Fatalf("%q contains %q outside hex — a derived handle must not spell anything", h, string(c))
		}
	}
}
