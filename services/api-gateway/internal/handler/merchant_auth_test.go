package handler

import (
	"context"
	"encoding/json"
	"errors"
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
	lookup    service.MerchantLookup
}

func (f *fakeCreds) VerifyHandlePin(_ context.Context, _, _ string) (string, string, error) {
	return f.mid, f.env, f.verifyErr
}
func (f *fakeCreds) LookupHandle(_ context.Context, _ string) (service.MerchantLookup, error) {
	return f.lookup, nil
}

// fakeSessions is an in-memory Business App session store: enough to prove the
// handler issues, renews and ends sessions; rotation and reuse are proven
// against Postgres in the service tests.
type fakeSessions struct {
	opened   int
	renewErr error
	ended    []string
}

func (f *fakeSessions) Open(_ context.Context, mid, env string) (service.IssuedSession, error) {
	f.opened++
	return service.IssuedSession{MerchantID: mid, Environment: env, RefreshToken: "bzs_fake", RefreshExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (f *fakeSessions) Renew(_ context.Context, tok string) (service.IssuedSession, error) {
	if f.renewErr != nil {
		return service.IssuedSession{}, f.renewErr
	}
	return service.IssuedSession{MerchantID: "m-123", Environment: "SANDBOX", RefreshToken: tok + "-next", RefreshExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (f *fakeSessions) End(_ context.Context, tok string) error {
	f.ended = append(f.ended, tok)
	return nil
}

func postJSON(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestMerchantAuthToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}

	t.Run("success opens a session: a short access token and a refresh token", func(t *testing.T) {
		sessions := &fakeSessions{}
		h := NewMerchantAuthHandler(cfg, &fakeCreds{mid: "m-123", env: "SANDBOX"}).WithSessions(sessions)
		rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if out["token"] == nil || out["token"] == "" {
			t.Error("expected a token in the response")
		}
		if out["refresh_token"] != "bzs_fake" || sessions.opened != 1 {
			t.Errorf("refresh_token = %v, sessions opened = %d", out["refresh_token"], sessions.opened)
		}
		exp, _ := time.Parse(time.RFC3339, out["expires_at"].(string))
		if d := time.Until(exp); d > 16*time.Minute || d < 14*time.Minute {
			t.Errorf("access token lives %v, want 15 minutes", d)
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

	t.Run("no session store → 503, never an unrenewable token", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{mid: "m-123", env: "SANDBOX"})
		rec := postJSON(h.Token, `{"handle":"doa_sandbox","pin":"1234"}`)
		if rec.Code != http.StatusServiceUnavailable || strings.Contains(rec.Body.String(), "token\":") {
			t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
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

func TestMerchantAuthLookup(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}

	decode := func(rec *httptest.ResponseRecorder) map[string]any {
		var m map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &m)
		return m
	}

	t.Run("active account → exists + can_login", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{lookup: service.MerchantLookup{
			Exists: true, CanLogin: true, Status: "ACTIVE", DisplayName: "Doa Sandbox",
		}})
		rec := postJSON(h.Lookup, `{"handle":"doa_sandbox"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		out := decode(rec)
		if out["exists"] != true || out["can_login"] != true {
			t.Errorf("expected exists+can_login true, got %v", out)
		}
		if out["display_name"] != "Doa Sandbox" {
			t.Errorf("display_name = %v", out["display_name"])
		}
	})

	t.Run("unknown handle → exists false (no leak)", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{lookup: service.MerchantLookup{Exists: false}})
		out := decode(postJSON(h.Lookup, `{"handle":"nao_existe"}`))
		if out["exists"] != false || out["can_login"] != false {
			t.Errorf("expected exists+can_login false, got %v", out)
		}
		if _, ok := out["display_name"]; ok {
			t.Errorf("must not leak display_name for unknown handle")
		}
	})

	t.Run("handle in the other environment → other_environment, no leak", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{lookup: service.MerchantLookup{
			Exists: false, CanLogin: false, OtherEnvironment: "LIVE",
		}})
		out := decode(postJSON(h.Lookup, `{"handle":"jrm"}`))
		if out["exists"] != false {
			t.Errorf("must stay exists=false, got %v", out)
		}
		if out["other_environment"] != "LIVE" {
			t.Errorf("expected other_environment=LIVE, got %v", out["other_environment"])
		}
		if _, ok := out["display_name"]; ok {
			t.Errorf("must not leak display_name across environments")
		}
	})

	t.Run("suspended → exists true, can_login false", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{lookup: service.MerchantLookup{
			Exists: true, CanLogin: false, Status: "SUSPENDED", DisplayName: "X",
		}})
		out := decode(postJSON(h.Lookup, `{"handle":"x_business"}`))
		if out["exists"] != true || out["can_login"] != false || out["status"] != "SUSPENDED" {
			t.Errorf("expected suspended/can_login false, got %v", out)
		}
	})

	t.Run("missing handle → 400", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{})
		if rec := postJSON(h.Lookup, `{}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("malformed handle → 400", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{})
		if rec := postJSON(h.Lookup, `{"handle":"ab"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("service unavailable → 503", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, nil)
		if rec := postJSON(h.Lookup, `{"handle":"x"}`); rec.Code != http.StatusServiceUnavailable {
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

// The claim route is retired: it answers 410 to anyone, token or not, and
// sets nothing — a Business's PIN is set only through activation.
func TestMerchantAuthClaimRetired(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}
	for _, withToken := range []bool{true, false} {
		req := httptest.NewRequest(http.MethodPost, "/v1/merchant/auth/claim", strings.NewReader(`{"handle":"doa_sandbox","pin":"1234"}`))
		if withToken {
			req.Header.Set("Authorization", "Bearer "+merchantToken(t, cfg))
		}
		rec := httptest.NewRecorder()
		claimRouter(cfg, &fakeCreds{}).ServeHTTP(rec, req)
		want := http.StatusGone
		if !withToken {
			want = http.StatusUnauthorized // the route still sits behind merchant auth
		}
		if rec.Code != want {
			t.Fatalf("token=%v: status = %d, want %d", withToken, rec.Code, want)
		}
		if withToken && !strings.Contains(rec.Body.String(), "PIN_SET_BY_ACTIVATION") {
			t.Fatalf("body = %s", rec.Body.String())
		}
	}
}

func TestMerchantAuthRefreshAndLogout(t *testing.T) {
	cfg := &config.Config{JWTSecret: testSecret}

	t.Run("renewal returns a new access token and the rotated refresh token", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{}).WithSessions(&fakeSessions{})
		rec := postJSON(h.Refresh, `{"refresh_token":"bzs_a"}`)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if rec.Code != 200 || out["refresh_token"] != "bzs_a-next" || out["token"] == "" {
			t.Fatalf("%d %v", rec.Code, out)
		}
	})
	for name, err := range map[string]error{"ended": service.ErrSessionInvalid, "reused": service.ErrSessionReused} {
		t.Run("a "+name+" session is one 401 SESSION_ENDED", func(t *testing.T) {
			h := NewMerchantAuthHandler(cfg, &fakeCreds{}).WithSessions(&fakeSessions{renewErr: err})
			rec := postJSON(h.Refresh, `{"refresh_token":"bzs_a"}`)
			if rec.Code != 401 || !strings.Contains(rec.Body.String(), "SESSION_ENDED") {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
		})
	}
	t.Run("a store outage is not a signed-out session", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{}).WithSessions(&fakeSessions{renewErr: errors.New("db down")})
		if rec := postJSON(h.Refresh, `{"refresh_token":"bzs_a"}`); rec.Code != 503 {
			t.Fatalf("%d — an outage must not send the app to sign-in", rec.Code)
		}
	})
	t.Run("a missing token is a 400", func(t *testing.T) {
		h := NewMerchantAuthHandler(cfg, &fakeCreds{}).WithSessions(&fakeSessions{})
		if rec := postJSON(h.Refresh, `{}`); rec.Code != 400 {
			t.Fatalf("%d", rec.Code)
		}
	})
	t.Run("sign-out ends the session and is always 204", func(t *testing.T) {
		s := &fakeSessions{}
		h := NewMerchantAuthHandler(cfg, &fakeCreds{}).WithSessions(s)
		if rec := postJSON(h.Logout, `{"refresh_token":"bzs_a"}`); rec.Code != 204 || len(s.ended) != 1 {
			t.Fatalf("%d ended=%v", rec.Code, s.ended)
		}
		if rec := postJSON(h.Logout, `{}`); rec.Code != 204 {
			t.Fatalf("%d", rec.Code)
		}
	})
}
