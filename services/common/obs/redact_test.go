package obs

import (
	"strings"
	"testing"
)

const synthetic = "BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0" // tools/assurance/synthetic-proof-references.txt

// No path — canonical route, mistyped route, altered spelling, prefix stripped —
// logs the reference past its first group.
func TestRedactPath_NoProofReferenceWhole(t *testing.T) {
	tail := strings.ToLower(synthetic[9:]) // everything after "BZM-7K2M-"
	for _, route := range []string{"/v1/public/proofs/", "//v1/public/proofs/", "/v1//public/proofs/",
		"/V1/public/proofs/", "/r/", "/R/", "/admin/v1/proofs/", "/", "/anything/"} {
		for _, seg := range []string{synthetic, strings.ToLower(synthetic), "%20" + synthetic, "x" + synthetic,
			synthetic + "/receipt", synthetic[4:], "x" + synthetic[4:], strings.ReplaceAll(synthetic, "-", "%2D")} {
			got := RedactPath(route + seg)
			if strings.Contains(strings.ToLower(got), tail[:9]) || strings.Contains(strings.ToLower(got), "qy5r-byn0") {
				t.Errorf("RedactPath(%q) = %q: the reference reached the log", route+seg, got)
			}
		}
	}
}

func TestRedactPath_KeepsTheRouteReadable(t *testing.T) {
	if got := RedactPath("/v1/public/proofs/" + synthetic); got != "/v1/public/proofs/BZM-7K2M…" {
		t.Fatalf("got %q", got)
	}
	for _, p := range []string{"/v1/wallets", "/v1/merchant/auth/token", "/v1/public/proofs/",
		"/v1/consumer/transactions/5eed0a11-b4e5-4309-ba3e-d0a376ed94b5/receipt.pdf"} {
		if got := RedactPath(p); got != p {
			t.Errorf("RedactPath(%q) = %q: an ordinary path must be left alone", p, got)
		}
	}
}

func TestRedactPath_APIKeyAndQuery(t *testing.T) {
	key := "bz_test_sk_" + strings.Repeat("a1", 16)
	if got := RedactPath("/v1/x/" + key + "/y?token=abc"); got != "/v1/x/[REDACTED]/y" {
		t.Fatalf("got %q", got)
	}
}
