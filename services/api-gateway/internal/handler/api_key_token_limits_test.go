package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A9-02. A token exchanged for an API key is not checked against revocation
// on every request, so it lived 24 hours after its key was revoked — and any
// merchant token, that one included, could mint a new key: a leaked key could
// plant its own replacement. The token now lives fifteen minutes and says what
// it was exchanged for, and a key-derived token cannot mint keys.
func TestAPIKeyToken_IsShortLivedAndMarked(t *testing.T) {
	cfg := &config.Config{JWTSecret: "0123456789abcdef0123456789abcdef"}
	h := NewAuthHandler(cfg, &statusMerchants{status: service.MerchantStatusActive})
	w := httptest.NewRecorder()
	h.Token(w, httptest.NewRequest(http.MethodPost, "/v1/auth/token", strings.NewReader(`{"api_key":"bz_test_sk_x"}`)))
	var out struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expires_at"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	exp, err := time.Parse(time.RFC3339, out.ExpiresAt)
	if err != nil || time.Until(exp) > 16*time.Minute {
		t.Fatalf("a key-derived token lives until %s — want at most fifteen minutes", out.ExpiresAt)
	}

	// The token carries its source through verification.
	var seen *middleware.Principal
	probe := middleware.Auth(cfg)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen, _ = middleware.GetPrincipal(r.Context())
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+out.Token)
	probe.ServeHTTP(httptest.NewRecorder(), req)
	if seen == nil || seen.Source != middleware.SourceAPIKey {
		t.Fatalf("the verified principal does not say it came from an API key: %+v", seen)
	}
}

func TestCreateApiKey_AKeyCannotMintKeys(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	mk := func(source string) *http.Request {
		req := merchantReq("POST", "/v1/merchants/me/api-keys", "own-merchant", "own-merchant", `{"name":"k"}`)
		return req.WithContext(middleware.ContextWithPrincipal(req.Context(),
			&middleware.Principal{MerchantID: "own-merchant", Scopes: []string{"*"}, Environment: "SANDBOX", Source: source}))
	}
	rec := httptest.NewRecorder()
	h.CreateApiKey(rec, mk(middleware.SourceAPIKey))
	if rec.Code != http.StatusForbidden || svc.createdKeys != 0 {
		t.Fatalf("a key-derived token minted a key: %d (created %d)", rec.Code, svc.createdKeys)
	}
	rec = httptest.NewRecorder()
	h.CreateApiKey(rec, mk(""))
	if rec.Code != http.StatusCreated || svc.createdKeys != 1 {
		t.Fatalf("a Business App session could not mint a key: %d", rec.Code)
	}
}
