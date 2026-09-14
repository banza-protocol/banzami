package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// Realtime status lives in its own namespace, reached without an API key, and
// never shadows the Payment Session resource the dual-credential mount serves.
func TestRealtimeRoute_MountedBesideTheSessionResource(t *testing.T) {
	r := newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret:               "0123456789abcdef0123456789abcdef",
		DeveloperKeyAuthEnabled: true,
		DeveloperInternalKey:    "internal-test-credential",
		DeveloperAPIURL:         "http://developer-api",
	}, Dependencies{})
	routes := map[string]bool{}
	_ = chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		routes[method+" "+route] = true
		return nil
	})
	for _, want := range []string{
		"GET /v1/realtime/payment-sessions/{id}",
		"GET /v1/payment-sessions/{id}",
	} {
		if !routes[want] {
			t.Errorf("%s is not mounted", want)
		}
	}
	for route := range routes {
		if strings.HasPrefix(route, "POST /v1/realtime") || strings.HasPrefix(route, "PUT /v1/realtime") ||
			strings.HasPrefix(route, "PATCH /v1/realtime") || strings.HasPrefix(route, "DELETE /v1/realtime") {
			t.Errorf("a write route exists in the realtime namespace: %s", route)
		}
	}

	// A preflight from any origin reaches the realtime handler's own CORS answer
	// instead of the global allowlist's empty 204.
	req := httptest.NewRequest(http.MethodOptions, "/v1/realtime/payment-sessions/abc", nil)
	req.Header.Set("Origin", "https://shop.example")
	req.Header.Set("Access-Control-Request-Headers", "authorization")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}
	if rec.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("realtime CORS must never allow credentials")
	}
}
