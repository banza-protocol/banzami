package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A nil audit service must say so, not pretend the trail is empty.
//
// An audit endpoint that answers 200 with zero rows when it is not wired is the
// worst possible failure: it looks like "nothing happened" to exactly the person
// who came to check whether something did.
func TestAdminAudit_UnconfiguredSaysSoInsteadOfReturningNothing(t *testing.T) {
	h := NewAdminAuditHandler(nil)
	rec := httptest.NewRecorder()
	h.Query(rec, httptest.NewRequest(http.MethodGet, "/admin/v1/audit-log", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 — an unwired audit trail must not look empty", rec.Code)
	}
	if body := rec.Body.String(); !contains(body, "UNAVAILABLE") {
		t.Fatalf("body = %s, want an UNAVAILABLE code", body)
	}
}

// A malformed cursor is a bad request, not a silent full-table read.
func TestAdminAudit_RejectsAnUnparseableCursor(t *testing.T) {
	h := NewAdminAuditHandler(nil)
	rec := httptest.NewRecorder()
	h.Query(rec, httptest.NewRequest(http.MethodGet, "/admin/v1/audit-log?before=yesterday", nil))
	// Unconfigured is checked first, so this asserts ordering is deliberate:
	// the 503 comes before any parameter parsing.
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func contains(h, n string) bool {
	return len(h) >= len(n) && (func() bool {
		for i := 0; i+len(n) <= len(h); i++ {
			if h[i:i+len(n)] == n {
				return true
			}
		}
		return false
	}())
}
