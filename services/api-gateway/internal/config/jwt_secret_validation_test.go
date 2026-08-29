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
		{"one below minimum is rejected", string(make([]byte, MinJWTSecretLen-1)), true},
		{"minimum length is accepted", string(make([]byte, MinJWTSecretLen)), false},
		{"dev.sh style 64 hex is accepted", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateJWTSecret(tc.secret)
			if tc.wantErr && err == nil {
				t.Fatalf("want error for %q-length secret, got nil", len(tc.secret))
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
