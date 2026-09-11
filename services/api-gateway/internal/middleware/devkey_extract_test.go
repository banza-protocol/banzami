package middleware

import (
	"net/http/httptest"
	"testing"
)

// A3-08: a developer key has one spelling. Unicode whitespace around it is not
// forgiven; ASCII space and tab (header folding) are.
func TestExtractDevKey_TrimsOnlyASCIIWhitespace(t *testing.T) {
	for raw, want := range map[string]string{
		"Bearer bz_test_sk_abc":     "bz_test_sk_abc",
		"Bearer  bz_test_sk_abc \t": "bz_test_sk_abc",
		"Bearer bz_test_sk_abc ":    "bz_test_sk_abc ",
		"Bearer  bz_test_sk_abc":    " bz_test_sk_abc",
	} {
		r := httptest.NewRequest("GET", "/", nil)
		r.Header.Set("Authorization", raw)
		if got := extractDevKey(r); got != want {
			t.Fatalf("%q → %q, want %q", raw, got, want)
		}
	}
}
