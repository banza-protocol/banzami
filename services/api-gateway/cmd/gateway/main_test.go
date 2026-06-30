package main

import "testing"

// Audit Part 7 / bug #10: a LIVE stack must refuse to start without a proof
// signing key (unkeyed HMAC proof signatures are forgeable); dev/sandbox may
// run unkeyed with a warning.
func TestProofSigningKeyState(t *testing.T) {
	cases := []struct {
		name string
		env  string
		key  string
		want proofKeyState
	}{
		{"live missing key is fatal", "LIVE", "", proofKeyFatal},
		{"live lowercase missing key is fatal", "live", "", proofKeyFatal},
		{"live with key is ok", "LIVE", "s3cret", proofKeyOK},
		{"sandbox missing key warns", "SANDBOX", "", proofKeyWarn},
		{"development missing key warns", "development", "", proofKeyWarn},
		{"sandbox with key is ok", "SANDBOX", "s3cret", proofKeyOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := proofSigningKeyState(c.env, c.key); got != c.want {
				t.Fatalf("proofSigningKeyState(%q, key-present=%v) = %d, want %d", c.env, c.key != "", got, c.want)
			}
		})
	}
}
