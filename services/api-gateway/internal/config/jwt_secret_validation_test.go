package config

import "testing"

// SEC-001: the gateway must refuse to start without a usable signing key,
// rather than boot and serve authenticated routes with a forgeable credential.
func TestValidateJWTSecretFailsClosed(t *testing.T) {
	cases := []struct {
		name    string
		secret  string
		wantErr bool
	}{
		{"empty is rejected", "", true},
		{"short is rejected", "short-secret", true},
		{"one below minimum is rejected", "0123456789abcdef0123456789abcde", true},
		{"exactly the minimum length is accepted", "0123456789abcdef0123456789abcdef", false},
		{"a long run of NUL bytes is rejected (length without entropy)", string(make([]byte, 64)), true},
		{"dev.sh style 64 hex is accepted", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", false},

		// Length alone is not strength. Each of these clears the 32-character
		// floor while remaining trivially guessable.
		{"whitespace-only is rejected", "                                        ", true},
		{"tabs-only is rejected", "\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t", true},
		{"single repeated character is rejected", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true},
		{"two alternating characters is rejected", "abababababababababababababababababababab", true},

		// A stray space from .env quoting silently changes which bytes are the
		// key, so it must be reported rather than trimmed away.
		{"leading whitespace is rejected", " 0123456789abcdef0123456789abcdef0123456789abcdef", true},
		{"trailing whitespace is rejected", "0123456789abcdef0123456789abcdef0123456789abcdef ", true},

		// A real generated secret keeps working.
		// Self-evidently a test string, not a credential: a realistic random value
		// here would (correctly) be reported by the repository secret scanner.
		{"a mixed-character secret of adequate length is accepted", "unit-test-only-not-a-real-signing-key-000000", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateJWTSecret(tc.secret)
			if tc.wantErr && err == nil {
				t.Fatalf("want error for a %d-character secret, got nil", len(tc.secret))
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("want no error, got %v", err)
			}
		})
	}
}

// The rejection message must never echo the secret itself.
func TestValidateJWTSecretDoesNotLeakSecret(t *testing.T) {
	const weak = "hunter2-hunter2"
	err := validateJWTSecret(weak)
	if err == nil {
		t.Fatal("weak secret must be rejected")
	}
	if got := err.Error(); contains(got, weak) {
		t.Fatalf("error leaked the secret value: %s", got)
	}
}

func contains(h, n string) bool {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return true
		}
	}
	return false
}
