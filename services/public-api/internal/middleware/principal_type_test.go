package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/banzami/banzami/services/public-api/internal/config"
)

// forgeHS256 builds a token the way a caller would present one, signed with the
// service's own secret — so what is under test is the CLAIM SHAPE, not the
// signature.
func forgeHS256(t *testing.T, key, claimsJSON string) string {
	t.Helper()
	b64 := func(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
	signing := b64([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." + b64([]byte(claimsJSON))
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(signing))
	return signing + "." + b64(mac.Sum(nil))
}

func exp() string { return strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10) }
func iat() string { return strconv.FormatInt(time.Now().Unix(), 10) }

// SEC-018 principal separation: api-gateway and public-api sign tokens with the
// SAME HS256 secret, so a merchant token is cryptographically valid here. The
// consumer surface must reject it on its claim shape — a merchant principal has
// no consumer identity and must never be admitted to consumer-owned resources
// such as a P2P transfer.
func TestConsumerSurface_RejectsMerchantToken(t *testing.T) {
	const secret = "public-api-unit-test-signing-key-000000"
	cfg := &config.Config{JWTSecret: secret}

	merchantToken := forgeHS256(t, secret,
		`{"merchant_id":"m-1","scopes":["*"],"environment":"LIVE","exp":`+exp()+`,"iat":`+iat()+`}`)

	reached := false
	h := Auth(cfg, liveSessions{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/transfers/some-id", nil)
	req.Header.Set("Authorization", "Bearer "+merchantToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if reached {
		t.Fatal("a merchant token reached a consumer-surface handler")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 for a merchant token on the consumer surface, got %d", rec.Code)
	}
}

// A token carrying neither identity is likewise rejected — absence of a consumer
// identity is never treated as an anonymous-but-allowed caller.
func TestConsumerSurface_RejectsTokenWithoutConsumerIdentity(t *testing.T) {
	const secret = "public-api-unit-test-signing-key-000000"
	cfg := &config.Config{JWTSecret: secret}

	anon := forgeHS256(t, secret, `{"scopes":["consumer"],"exp":`+exp()+`,"iat":`+iat()+`}`)

	reached := false
	h := Auth(cfg, liveSessions{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true }))
	req := httptest.NewRequest(http.MethodGet, "/v1/transfers/some-id", nil)
	req.Header.Set("Authorization", "Bearer "+anon)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if reached || rec.Code != http.StatusUnauthorized {
		t.Fatalf("token with no consumer identity not rejected: reached=%v code=%d", reached, rec.Code)
	}
}

// The legitimate consumer token still authenticates — the guard must not break
// the consumer surface it protects.
func TestConsumerSurface_AcceptsConsumerToken(t *testing.T) {
	const secret = "public-api-unit-test-signing-key-000000"
	cfg := &config.Config{JWTSecret: secret}

	consumerToken := forgeHS256(t, secret,
		`{"customer_id":"consumer-1","scopes":["consumer"],"exp":`+exp()+`,"iat":`+iat()+`}`)

	var got string
	h := Auth(cfg, liveSessions{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, ok := GetConsumer(r.Context()); ok {
			got = c.ID
		}
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/transfers/some-id", nil)
	req.Header.Set("Authorization", "Bearer "+consumerToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || got != "consumer-1" {
		t.Fatalf("valid consumer token rejected: code=%d consumer=%q", rec.Code, got)
	}
}
