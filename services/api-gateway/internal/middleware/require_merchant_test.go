package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// SEC-004: public-api mints consumer tokens with the SAME HS256 secret and the
// same claim shape as merchant tokens, so `Auth` alone cannot distinguish them —
// a consumer token authenticates on the merchant surface. RequireMerchant makes
// the principal TYPE an explicit route requirement so the merchant surface fails
// closed for a consumer credential regardless of what each handler checks.
func TestRequireMerchant_RejectsConsumerPrincipal(t *testing.T) {
	reached := false
	h := RequireMerchant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/consumer-wallets/w-1/balance", nil)
	// A consumer token yields a principal with CustomerID and no MerchantID.
	req = req.WithContext(ContextWithPrincipal(req.Context(),
		&Principal{CustomerID: "consumer-1", Scopes: []string{"consumer"}}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if reached {
		t.Fatal("a consumer principal reached a merchant-surface handler")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403, got %d", rec.Code)
	}
}

func TestRequireMerchant_RejectsUnauthenticated(t *testing.T) {
	reached := false
	h := RequireMerchant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/wallets", nil))
	if reached || rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated request not rejected: reached=%v code=%d", reached, rec.Code)
	}
}

func TestRequireMerchant_AllowsMerchantPrincipal(t *testing.T) {
	reached := false
	h := RequireMerchant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/wallets", nil)
	req = req.WithContext(ContextWithPrincipal(req.Context(),
		&Principal{MerchantID: "m-1", Scopes: []string{"*"}}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("merchant principal blocked: reached=%v code=%d", reached, rec.Code)
	}
}
