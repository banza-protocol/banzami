package server

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// routesWithReceivePoint walks a router built WITH a receive-point service wired
// (a nil pool is fine — chi.Walk never invokes a handler). This is the only way to
// see the ADR-065 routes, which are nil-guarded off when no database is present.
func routesWithReceivePoint(t *testing.T) map[string]bool {
	t.Helper()
	r := newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret: "0123456789abcdef0123456789abcdef",
	}, Dependencies{
		BusinessReceivePointSvc: service.NewBusinessReceivePointService(nil),
	})
	routes := map[string]bool{}
	if err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		routes[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	return routes
}

// The three surfaces are mounted where they belong: the owner surface under the
// merchant /v1/business path, public resolution under /v1/receive-points, and the
// mint ONLY under /internal (the service-credential surface).
func TestReceivePoint_SurfacesMountedCorrectly(t *testing.T) {
	routes := routesWithReceivePoint(t)
	for _, want := range []string{
		"GET /v1/business/receive-point",
		"GET /v1/business/receive-point/qr",
		"POST /v1/business/receive-point/disable",
		"GET /v1/receive-points/{slug}",
		"GET /internal/v1/receive-points/{slug}",
		"POST /internal/v1/receive-points/{slug}/sessions",
	} {
		if !routes[want] {
			t.Errorf("%s must be mounted", want)
		}
	}
}

// The mint is a service-to-service capability: the payer is asserted by the trusted
// caller (public-api). It must NEVER appear on a public /v1 surface where an end
// client could name any payer. A route-table assertion — a missing route cannot be
// reached, where a handler returning 403 could be re-mounted by accident.
func TestReceivePoint_MintIsInternalOnly(t *testing.T) {
	routes := routesWithReceivePoint(t)
	for route := range routes {
		if route == "POST /v1/receive-points/{slug}/sessions" {
			t.Errorf("mint must not be reachable on the public surface: %s", route)
		}
	}
	if !routes["POST /internal/v1/receive-points/{slug}/sessions"] {
		t.Error("mint must be mounted on the internal surface")
	}
}

// Without a database the whole feature stays unmounted rather than half-wired.
func TestReceivePoint_UnmountedWithoutService(t *testing.T) {
	routes := registeredRoutes(t) // built with empty Dependencies{}
	for route := range routes {
		if route == "GET /v1/business/receive-point" ||
			route == "GET /v1/receive-points/{slug}" ||
			route == "POST /internal/v1/receive-points/{slug}/sessions" {
			t.Errorf("receive-point route mounted without a service: %s", route)
		}
	}
}
