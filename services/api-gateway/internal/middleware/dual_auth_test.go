package middleware

// Credential-separation security tests for the canonical payment routes
// (ADR-047 / RT04B §5/§8). The two auth paths must never fall back into each
// other: a developer-key attempt is resolved ONLY by the developer-key authority
// and a JWT ONLY by JWT verification. Every failure fails closed and the
// protected handler never runs.

import (
	"github.com/golang-jwt/jwt/v5"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

func TestDualAuth_SeparatesCredentialsNoFallback(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	goodDev := &fakeDevAuthorizer{ctx: &service.DeveloperKeyContext{
		KeyID: "k1", Environment: "SANDBOX", ProjectSlug: "proj", KeyStatus: "active",
		Scopes: []string{"payment_sessions:write"}, Bound: true,
		MerchantID: "m1", WalletID: "w1", WalletAccountID: "wa1",
	}}
	jwt, _, err := NewMerchantToken("test-secret", "merch-1", []string{"*"}, "SANDBOX", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name       string
		authz      string
		apiKey     string
		client     devKeyAuthorizer
		wantStatus int
		wantDev    bool // developer principal expected on success
		wantMerch  bool // merchant principal expected on success
	}{
		{"dev key → dev principal", "Bearer bz_test_sk_abc", "", goodDev, 200, true, false},
		{"jwt → merchant principal", "Bearer " + jwt, "", goodDev, 200, false, true},
		{"bz_live rejected, no JWT fallback", "Bearer bz_live_sk_x", "", goodDev, 401, false, false},
		{"dev dependency fault → 503", "Bearer bz_test_sk_abc", "", &fakeDevAuthorizer{err: service.ErrAuthorizationUnavailable}, 503, false, false},
		{"invalid dev key → 401", "Bearer bz_test_sk_abc", "", &fakeDevAuthorizer{err: service.ErrDeveloperKeyInvalid}, 401, false, false},
		{"invalid jwt → 401, no dev fallback", "Bearer not.a.jwt", "", goodDev, 401, false, false},
		{"no credential → 401", "", "", goodDev, 401, false, false},
		{"X-API-Key routes to dev path", "", "bz_test_sk_abc", goodDev, 200, true, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var sawDev, sawMerch, ran bool
			h := DualAuth(cfg, c.client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ran = true
				_, sawDev = GetDeveloperPrincipal(r.Context())
				_, sawMerch = GetPrincipal(r.Context())
				w.WriteHeader(http.StatusOK)
			}))
			req := httptest.NewRequest(http.MethodPost, "/v1/payment-sessions", nil)
			if c.authz != "" {
				req.Header.Set("Authorization", c.authz)
			}
			if c.apiKey != "" {
				req.Header.Set("X-API-Key", c.apiKey)
			}
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)

			if rr.Code != c.wantStatus {
				t.Fatalf("status: got %d want %d", rr.Code, c.wantStatus)
			}
			if c.wantStatus != 200 && ran {
				t.Error("protected handler ran on a failed auth (must fail closed)")
			}
			if c.wantStatus == 200 {
				if sawDev != c.wantDev {
					t.Errorf("developer principal present=%v want %v", sawDev, c.wantDev)
				}
				if sawMerch != c.wantMerch {
					t.Errorf("merchant principal present=%v want %v", sawMerch, c.wantMerch)
				}
				// The two principal types are mutually exclusive — no cross-contamination.
				if sawDev && sawMerch {
					t.Error("both principals present — credentials must not cross over")
				}
			}
		})
	}
}

// A developer-key attempt with developer-key auth disabled (nil client) fails
// closed — it must NOT fall back to JWT verification.
func TestDualAuth_DevKeyDisabledFailsClosed(t *testing.T) {
	cfg := &config.Config{JWTSecret: "s"}
	var ran bool
	h := DualAuth(cfg, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ran = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodPost, "/v1/payment-links", nil)
	req.Header.Set("Authorization", "Bearer bz_test_sk_abc")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized || ran {
		t.Fatalf("dev key with nil client must fail closed: status=%d ran=%v", rr.Code, ran)
	}
}

// A consumer token is signed with the same secret as a merchant token and
// verifies here, with no merchant id. It is refused at the door: handlers that
// keyed ownership on "is there a merchant principal?" let it list and cancel
// another merchant's payment links on the deployed Sandbox (V01).
func TestDualAuth_ConsumerTokenRefused(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	claims := &jwtClaims{CustomerID: "c-1", Scopes: []string{"consumer"}, Environment: "SANDBOX",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	ran := false
	h := DualAuth(cfg, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { ran = true }))
	req := httptest.NewRequest(http.MethodGet, "/v1/payment-links?merchant_id=m-victim", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden || ran {
		t.Fatalf("a consumer token on the merchant/developer surface: got %d (handler ran: %v), want 403", w.Code, ran)
	}
}
