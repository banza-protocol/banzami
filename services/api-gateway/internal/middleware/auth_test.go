package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banza-protocol/banzami/services/api-gateway/internal/config"
	"github.com/banza-protocol/banzami/services/api-gateway/internal/middleware"
)

const testSecret = "test-secret-at-least-32-bytes-long-xyz"

func makeConfig() *config.Config {
	return &config.Config{JWTSecret: testSecret}
}

func okHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

func TestAuth_MissingHeader_Returns401(t *testing.T) {
	handler := middleware.Auth(makeConfig())(http.HandlerFunc(okHandler))
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuth_InvalidBearerFormat_Returns401(t *testing.T) {
	handler := middleware.Auth(makeConfig())(http.HandlerFunc(okHandler))
	for _, bad := range []string{"Basic xyz", "Bearer", "  ", "token-without-scheme"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Authorization", bad)
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("header %q: expected 401, got %d", bad, w.Code)
		}
	}
}

func TestAuth_InvalidToken_Returns401(t *testing.T) {
	handler := middleware.Auth(makeConfig())(http.HandlerFunc(okHandler))
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer not.a.jwt")
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuth_ValidMerchantToken_PassesThrough(t *testing.T) {
	token, _, err := middleware.NewMerchantToken(testSecret, "merchant-001", []string{"*"}, "LIVE", time.Hour)
	if err != nil {
		t.Fatalf("NewMerchantToken: %v", err)
	}

	var captured *middleware.Principal
	handler := middleware.Auth(makeConfig())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.GetPrincipal(r.Context())
		if !ok {
			t.Error("expected principal in context")
		}
		captured = p
		w.WriteHeader(http.StatusOK)
	}))

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	handler.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if captured == nil || captured.MerchantID != "merchant-001" {
		t.Errorf("expected merchant-001 in principal, got %+v", captured)
	}
}

func TestAuth_WrongSecret_Returns401(t *testing.T) {
	token, _, err := middleware.NewMerchantToken("different-secret-xyz-at-least-32-chars", "merchant-001", []string{"*"}, "LIVE", time.Hour)
	if err != nil {
		t.Fatalf("NewMerchantToken: %v", err)
	}

	handler := middleware.Auth(makeConfig())(http.HandlerFunc(okHandler))
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for token signed with wrong secret, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// RequireScope middleware
// ---------------------------------------------------------------------------

func TestRequireScope_MissingScope_Returns403(t *testing.T) {
	p := &middleware.Principal{MerchantID: "merchant-001", Scopes: []string{"transactions:read"}}
	inner := middleware.RequireScope("transactions:write")(http.HandlerFunc(okHandler))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inner.ServeHTTP(w, r.WithContext(middleware.ContextWithPrincipal(r.Context(), p)))
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

func TestRequireScope_HasExactScope_PassesThrough(t *testing.T) {
	p := &middleware.Principal{MerchantID: "merchant-001", Scopes: []string{"transactions:write"}}
	inner := middleware.RequireScope("transactions:write")(http.HandlerFunc(okHandler))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inner.ServeHTTP(w, r.WithContext(middleware.ContextWithPrincipal(r.Context(), p)))
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestRequireScope_WildcardScope_PassesThrough(t *testing.T) {
	p := &middleware.Principal{MerchantID: "merchant-001", Scopes: []string{"*"}}
	inner := middleware.RequireScope("transactions:write")(http.HandlerFunc(okHandler))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inner.ServeHTTP(w, r.WithContext(middleware.ContextWithPrincipal(r.Context(), p)))
	})

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for wildcard scope, got %d", w.Code)
	}
}

func TestRequireScope_NoPrincipal_Returns401(t *testing.T) {
	handler := middleware.RequireScope("transactions:write")(http.HandlerFunc(okHandler))
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without principal, got %d", w.Code)
	}
}
