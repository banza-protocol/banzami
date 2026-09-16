package service

import "testing"

// TERMS-INFRASTRUCTURE-CONSISTENCY-001 — the acceptance-version invariant, proven
// without a database. A versioned (valid published-Terms) acceptance can be
// recorded ONLY when a document is published AND the applicant accepted exactly
// that version. While Terms are DRAFT (published == ""), nothing is ever
// persisted, so no valid acceptance can be forged — DRAFT fails closed.
func TestResolveAcceptedTermsVersion(t *testing.T) {
	cases := []struct {
		name      string
		sent      string
		published string
		want      string
	}{
		// DRAFT (no published document): fail closed regardless of what the client sends.
		{"draft, nothing sent", "", "", ""},
		{"draft, client forges a version", "2026-10-01", "", ""},
		// PUBLISHED: persist only an exact match.
		{"published, exact match", "2026-10-01", "2026-10-01", "2026-10-01"},
		{"published, stale version accepted", "2026-01-01", "2026-10-01", ""},
		{"published, nothing sent", "", "2026-10-01", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := resolveAcceptedTermsVersion(c.sent, c.published); got != c.want {
				t.Fatalf("resolveAcceptedTermsVersion(%q,%q) = %q, want %q", c.sent, c.published, got, c.want)
			}
		})
	}
}

// DRAFT_TERMS_VALID_ACCEPTANCE_PATHS=0: today PublishedTermsVersion is "", so no
// application submission can persist a Terms version — every acceptance is an
// unversioned pre-release acknowledgement.
func TestDraftHasNoPublishedVersion(t *testing.T) {
	if PublishedTermsVersion != "" {
		t.Fatalf("PublishedTermsVersion should be empty while Terms are DRAFT, got %q", PublishedTermsVersion)
	}
	if resolveAcceptedTermsVersion("anything", PublishedTermsVersion) != "" {
		t.Fatal("a version was persisted while Terms are DRAFT — acceptance must fail closed")
	}
}
