package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

func withCap(role string, cap auth.Capability) int {
	r := httptest.NewRequest("POST", "/x", nil)
	r = r.WithContext(auth.WithPrincipal(r.Context(), auth.Principal{ID: "u", Role: role}))
	w := httptest.NewRecorder()
	RequireCapability(cap)(http.HandlerFunc(ok)).ServeHTTP(w, r)
	return w.Code
}

func TestRequireCapability_AllowsWhenGranted(t *testing.T) {
	if code := withCap("OPERATIONS", auth.CapApplicationApprove); code != http.StatusOK {
		t.Fatalf("granted capability must pass, got %d", code)
	}
	if code := withCap("SUPER_ADMIN", auth.CapWalletCredit); code != http.StatusOK {
		t.Fatalf("super admin must pass, got %d", code)
	}
}

func TestRequireCapability_DeniesWhenMissing(t *testing.T) {
	if code := withCap("OPERATIONS", auth.CapWalletCredit); code != http.StatusForbidden {
		t.Fatalf("missing capability must be 403, got %d", code)
	}
	if code := withCap("READ_ONLY", auth.CapApplicationApprove); code != http.StatusForbidden {
		t.Fatalf("read-only mutation must be 403, got %d", code)
	}
}

func TestRequireCapability_DeniesWithoutPrincipal(t *testing.T) {
	r := httptest.NewRequest("POST", "/x", nil)
	w := httptest.NewRecorder()
	RequireCapability(auth.CapDashboardView)(http.HandlerFunc(ok)).ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no principal must be 401, got %d", w.Code)
	}
}
