package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

const testSecret = "test-jwt-secret"

type fakeCreds struct {
	mid, env  string
	verifyErr error
	claimErr  error
	claimed   bool
}

func (f *fakeCreds) VerifyHandlePin(_ context.Context, _, _ string) (string, string, error) {
	return f.mid, f.env, f.verifyErr
}
func (f *fakeCreds) Claim(_ context.Context, _, _, _, _ string) error {
	f.claimed = true
	return f.claimErr
}

func postJSON(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestMerchantAuthToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}

	t.Run("success issues a merchant JWT", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{mid: "m-123", env: "SANDBOX"})
		rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if out["token"] == nil || out["token"] == "" {
			t.Error("expected a token in the response")
		}
		if out["environment"] != "SANDBOX" {
			t.Errorf("environment = %v, want SANDBOX", out["environment"])
		}
	})

	t.Run("invalid handle/pin → 401 (non-enumerating)", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{verifyErr: service.ErrMerchantCredsInvalid})
		rec := postJSON(h.Token, `{"handle":"unknown","pin":"9999"}`)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rec.Code)
		}
	})

	t.Run("locked out → 429", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{verifyErr: service.ErrMerchantLocked})
		rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"0000"}`)
		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("status = %d, want 429", rec.Code)
		}
	})

	t.Run("missing fields → 400", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{})
		rec := postJSON(h.Token, `{"handle":"doa_sandbox"}`)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("service unavailable → 503", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, nil)
		rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want 503", rec.Code)
		}
	})
}

// claimRouter wires the real Auth middleware so we test the authenticated path.
func claimRouter(cfg *config.Config, creds service.MerchantCredentialService) http.Handler {
	h := NewMerchantAuthHandler(cfg, creds)
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg))
		r.Post("/v1/merchant/auth/claim", h.Claim)
	})
	return r
}

func merchantToken(t *testing.T, cfg *config.Config) string {
	t.Helper()
	tok, _, err := middleware.NewMerchantToken(cfg.JWTSecret, "m-123", []string{"*"}, "SANDBOX", time.Hour)
	if err != nil {
		t.Fatalf("token: %v", err)
	}
	return tok
}

func TestMerchantAuthClaim(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}

	do := func(creds service.MerchantCredentialService, withToken bool, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/merchant/auth/claim", strings.NewReader(body))
		if withToken {
			req.Header.Set("Authorization", "Bearer "+merchantToken(t, cfg))
		}
		rec := httptest.NewRecorder()
		claimRouter(cfg, creds).ServeHTTP(rec, req)
		return rec
	}

	t.Run("authenticated claim succeeds", func(t *testing.T) {
		fc := &fakeCreds{}
		rec := do(fc, true, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if !fc.claimed {
			t.Error("Claim was not called")
		}
	})

	t.Run("no token → 401", func(t *testing.T) {
		rec := do(&fakeCreds{}, false, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", rec.Code)
		}
	})

	t.Run("reserved handle → 409", func(t *testing.T) {
		rec := do(&fakeCreds{claimErr: service.ErrHandleReserved}, true, `{"handle":"admin","pin":"1234"}`)
		if rec.Code != http.StatusConflict {
			t.Fatalf("status = %d, want 409", rec.Code)
		}
	})

	t.Run("invalid handle → 400", func(t *testing.T) {
		rec := do(&fakeCreds{claimErr: service.ErrHandleInvalid}, true, `{"handle":"x","pin":"1234"}`)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})
}
