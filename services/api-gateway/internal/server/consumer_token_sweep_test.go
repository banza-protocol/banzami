package server

// CONSUMER_TOKEN_ON_MERCHANT_SURFACE = 0.
//
// A consumer token is signed with the gateway's secret and verifies on the
// merchant and dual-credential surfaces with no merchant id. Handlers that asked
// "is there a merchant principal?" skipped their ownership checks, and on the
// deployed Sandbox a token for a consumer that does not exist listed another
// merchant's payment links and passed ownership on cancel (V01).
//
// This walks EVERY mounted route and sends a consumer token. Every route that is
// not public, internal, developer-key-only or consumer KYC must refuse it with
// 401/403 before any handler runs — a new route is covered the day it lands.

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// Routes a consumer token may reach, or that do not take a JWT at all.
var consumerTokenExempt = []*regexp.Regexp{
	regexp.MustCompile(`^/(health|readyz|metrics)$`),
	regexp.MustCompile(`^/internal/`),         // InternalAuth, 404 at the edge
	regexp.MustCompile(`^/public/`),           // public payer surface
	regexp.MustCompile(`^/v1/public/`),        // proof verification
	regexp.MustCompile(`^/v1/platform-mode$`), //
	regexp.MustCompile(`^/v1/auth/token$`),    // credential exchange
	regexp.MustCompile(`^/v1/merchant/auth/(token|lookup|refresh|logout)$`),
	regexp.MustCompile(`^/v1/merchant/(applications|activation|application-requirements)`), // public onboarding
	regexp.MustCompile(`^/v1/callbacks/`),                                                  // provider callbacks (HMAC)
	regexp.MustCompile(`^/v1/(me|financial-setup)$`),                                       // developer-key only
	regexp.MustCompile(`^/v1/compliance/customers/`),                                       // consumer KYC — the one consumer use
}

func consumerToken(t *testing.T, secret string) string {
	t.Helper()
	claims := jwt.MapClaims{"customer_id": "5eed0a11-0000-4000-8000-000000000001", "scopes": []string{"consumer"},
		"environment": "SANDBOX", "exp": time.Now().Add(time.Hour).Unix()}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestConsumerTokenIsRefusedOnTheMerchantSurface(t *testing.T) {
	const secret = "0123456789abcdef0123456789abcdef"
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", MaxRetries: -1, DialerRetries: 1, DialerRetryTimeout: time.Millisecond})
	t.Cleanup(func() { _ = rdb.Close() })
	r := newRouter(&config.Config{Port: 8080, Environment: "SANDBOX", JWTSecret: secret}, Dependencies{Redis: rdb})
	tok := consumerToken(t, secret)
	param := regexp.MustCompile(`\{[^}]+\}`)

	checked := 0
	err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == http.MethodOptions {
			return nil // CORS preflight: answered before auth, carries no data
		}
		path := strings.TrimSuffix(strings.ReplaceAll(route, "/*", ""), "/")
		if path == "" {
			path = "/"
		}
		for _, ex := range consumerTokenExempt {
			if ex.MatchString(path) {
				return nil
			}
		}
		target := param.ReplaceAllString(path, "5eed0a11-0000-4000-8000-000000000002")
		req := httptest.NewRequest(method, target, strings.NewReader(`{}`))
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					t.Errorf("%s %s: a handler ran for a consumer token (panicked on empty deps: %v)", method, route, rec)
				}
			}()
			r.ServeHTTP(w, req)
		}()
		if w.Code != http.StatusUnauthorized && w.Code != http.StatusForbidden {
			t.Errorf("%s %s: consumer token got %d, want 401/403", method, route, w.Code)
		}
		checked++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked < 60 {
		t.Fatalf("only %d routes checked — the walk is not reaching the merchant surface", checked)
	}
	t.Logf("%d merchant/dual-credential routes refuse a consumer token", checked)
}
