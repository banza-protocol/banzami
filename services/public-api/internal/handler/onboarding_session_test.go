package handler

import (
	"strings"
	"testing"
)

// A3-06 / A9-05. Each spelling of one session id had its own verify allowance,
// and any string — a megabyte of it — became a limiter entry. The id is
// canonical before it is counted, and a non-UUID is refused.
func TestCanonicalSessionID(t *testing.T) {
	const want = "0b7d6f2e-1111-4c1a-9d6e-2a3b4c5d6e7f"
	for _, raw := range []string{want, strings.ToUpper(want), "{" + want + "}", "urn:uuid:" + want, strings.ReplaceAll(want, "-", "")} {
		got, ok := canonicalSessionID(raw)
		if !ok || got != want {
			t.Fatalf("%q → %q, %v; want %q", raw, got, ok, want)
		}
	}
	for _, raw := range []string{"", "not-a-uuid", strings.Repeat("a", 1<<20)} {
		if _, ok := canonicalSessionID(raw); ok {
			t.Fatalf("%.20q… was accepted as a session id", raw)
		}
	}
}

func TestOnboardingLimiter_OneAllowancePerSessionWhateverItsSpelling(t *testing.T) {
	l := newOnboardingRateLimiter()
	const id = "0b7d6f2e-1111-4c1a-9d6e-2a3b4c5d6e7f"
	allowed := 0
	for i := 0; i < 50; i++ {
		raw := id
		if i%2 == 1 {
			raw = strings.ToUpper(id)
		}
		sid, _ := canonicalSessionID(raw)
		if l.allowVerify(sid) {
			allowed++
		}
	}
	if allowed != 10 {
		t.Fatalf("%d verify attempts were allowed for one session, want 10", allowed)
	}
}
