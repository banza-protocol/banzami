package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// SEC-001 regression. An empty JWT_SECRET is a *valid* HS256 key, so before the
// fix an attacker could mint their own token (HMAC-SHA256 over the empty key)
// carrying any merchant_id with scopes ["*"] and environment "LIVE", and the
// gateway would authenticate it. Authentication must fail closed when no
// signing key is configured.
func TestForgedTokenRejectedWhenSigningKeyMissing(t *testing.T) {
	// The attacker forges the token themselves; they do not need the gateway
	// mint helper. Build it exactly as an attacker would: sign with "".
	forged := forgeHS256Token(t, "", `{"merchant_id":"victim-merchant","scopes":["*"],"environment":"LIVE","exp":`+
		itoa(time.Now().Add(time.Hour).Unix())+`,"iat":`+itoa(time.Now().Unix())+`}`)

	cfg := &config.Config{JWTSecret: ""} // JWT_SECRET unset

	reached := false
	h := Auth(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/wallet", nil)
	req.Header.Set("Authorization", "Bearer "+forged)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if reached {
		t.Fatal("forged token reached the protected handler: authentication bypass")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 for forged token with no signing key, got %d", rec.Code)
	}
}

// The same bypass is reachable through the dual-auth (developer key OR merchant
// JWT) middleware, which shares verifyJWT.
func TestDualAuthForgedTokenRejectedWhenSigningKeyMissing(t *testing.T) {
	forged := forgeHS256Token(t, "", `{"merchant_id":"victim-merchant","scopes":["*"],"environment":"LIVE","exp":`+
		itoa(time.Now().Add(time.Hour).Unix())+`,"iat":`+itoa(time.Now().Unix())+`}`)

	cfg := &config.Config{JWTSecret: ""}
	reached := false
	h := DualAuth(cfg, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+forged)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if reached {
		t.Fatal("forged token reached the protected handler via DualAuth")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

// Minting must also refuse the empty key, so a misconfigured gateway cannot
// hand out forgeable sessions to legitimate merchants.
func TestMintRefusesEmptySigningKey(t *testing.T) {
	if _, _, err := NewMerchantToken("", "m_1", []string{"*"}, "LIVE", time.Hour); err == nil {
		t.Fatal("NewMerchantToken minted a token with an empty signing key")
	}
}

// A properly configured secret still works — the guard must not break auth.
func TestValidSigningKeyStillAuthenticates(t *testing.T) {
	const secret = "unit-test-signing-key"
	tok, _, err := NewMerchantToken(secret, "m_1", []string{"payments:write"}, "SANDBOX", time.Hour)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	cfg := &config.Config{JWTSecret: secret}
	var got *Principal
	h := Auth(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, _ = GetPrincipal(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/wallet", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || got == nil || got.MerchantID != "m_1" {
		t.Fatalf("valid token must authenticate; code=%d principal=%+v", rec.Code, got)
	}
}
