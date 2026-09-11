package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A8-09 — an infrastructure failure is not a refusal. Every non-lockout error
// from VerifyHandlePin was answered 401 "invalid handle or pin", and the
// Business App answers a 401 at sign-in by forgetting the handle and PIN. A
// database blip signed Businesses out of their own app.
func TestMerchantAuthToken_OnlyARefusalIs401(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}
	dbDown := errors.New("failed to connect to `host=db`: dial tcp 10.0.0.5:5432: connect: connection refused")
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"wrong pin / unknown handle", service.ErrMerchantCredsInvalid, http.StatusUnauthorized, "UNAUTHORIZED"},
		{"credential not the handle owner's", service.ErrHandleOwnerMismatch, http.StatusUnauthorized, "UNAUTHORIZED"},
		{"locked", service.ErrMerchantLocked, http.StatusTooManyRequests, "LOCKED"},
		{"credential store down (wrapped)", fmt.Errorf("%w: read credential: %w", service.ErrMerchantCredsUnavailable, dbDown), http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
		{"any other failure", dbDown, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := NewMerchantAuthHandler(cfg, &fakeCreds{verifyErr: c.err}).WithSessions(&fakeSessions{})
			rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"1234"}`)
			if rec.Code != c.wantStatus || !strings.Contains(rec.Body.String(), `"`+c.wantCode+`"`) {
				t.Fatalf("status = %d body = %s, want %d %s", rec.Code, rec.Body.String(), c.wantStatus, c.wantCode)
			}
			if strings.Contains(rec.Body.String(), "dial tcp") {
				t.Fatalf("error text reached the caller: %s", rec.Body.String())
			}
		})
	}
}
