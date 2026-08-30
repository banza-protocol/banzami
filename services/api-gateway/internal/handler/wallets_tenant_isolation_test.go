package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// walletReq builds an authenticated request for /v1/wallets/{id}... with the
// chi route param populated, as the router would.
func walletReq(method, path, walletID, callerMerchant string) *http.Request {
	req := unauthWalletReq(method, path, walletID)
	return req.WithContext(middleware.ContextWithPrincipal(
		req.Context(),
		&middleware.Principal{MerchantID: callerMerchant, Environment: "LIVE"},
	))
}

// unauthWalletReq builds the request with the chi {id} route param populated,
// exactly as the router would, but with no authenticated principal.
func unauthWalletReq(method, path, walletID string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", walletID)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// SEC-002 regression: possession of a wallet id must not grant authority.
// Before the fix, GET /v1/wallets/{id} read the id straight from the URL and
// returned any merchant's wallet to any authenticated merchant.
func TestWalletGet_RejectsCrossMerchantAccess(t *testing.T) {
	// The wallet belongs to "victim-merchant"; the caller is "attacker-merchant".
	h := NewWalletHandler(&fakeWallets{merchantID: "victim-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, walletReq("GET", "/v1/wallets/w-victim", "w-victim", "attacker-merchant"))

	if rec.Code == http.StatusOK {
		t.Fatalf("cross-merchant wallet read succeeded: %s", rec.Body.String())
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 (no existence oracle), got %d: %s", rec.Code, rec.Body.String())
	}
	// The victim's merchant id must not leak in the error body.
	if b := rec.Body.String(); contains(b, "victim-merchant") {
		t.Fatalf("response leaked the owning merchant id: %s", b)
	}
}

// The balance of another merchant's wallet is financial data: same rule.
func TestWalletBalance_RejectsCrossMerchantAccess(t *testing.T) {
	h := NewWalletHandler(&fakeWallets{merchantID: "victim-merchant", available: 5_000_00})

	rec := httptest.NewRecorder()
	h.Balance(rec, walletReq("GET", "/v1/wallets/w-victim/balance", "w-victim", "attacker-merchant"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if contains(rec.Body.String(), "500000") {
		t.Fatal("cross-merchant balance leaked in the response")
	}
}

// Ledger-derived analytics are equally scoped.
func TestWalletAnalytics_RejectsCrossMerchantAccess(t *testing.T) {
	h := NewWalletHandler(&fakeWallets{merchantID: "victim-merchant"})

	rec := httptest.NewRecorder()
	h.Analytics(rec, walletReq("GET", "/v1/wallets/w-victim/analytics", "w-victim", "attacker-merchant"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

// The owner must still be able to read their own wallet — the guard must not
// break the legitimate path.
func TestWalletGet_OwnerStillAllowed(t *testing.T) {
	h := NewWalletHandler(&fakeWallets{merchantID: "own-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, walletReq("GET", "/v1/wallets/w-own", "w-own", "own-merchant"))

	if rec.Code != http.StatusOK {
		t.Fatalf("owner denied access to own wallet: %d %s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if got["merchant_id"] != "own-merchant" {
		t.Fatalf("unexpected wallet payload: %v", got)
	}
}

// An unauthenticated caller (no principal in context) is rejected before any
// wallet lookup happens.
func TestWalletGet_RejectsUnauthenticated(t *testing.T) {
	h := NewWalletHandler(&fakeWallets{merchantID: "victim-merchant"})
	rec := httptest.NewRecorder()
	h.Get(rec, unauthWalletReq("GET", "/v1/wallets/w-victim", "w-victim"))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 for unauthenticated caller, got %d", rec.Code)
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
