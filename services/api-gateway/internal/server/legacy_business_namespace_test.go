package server

// The public Developer API must expose no /v1/* route.
//
// "business" described where handlers happened to live when this surface was
// merchant-only. It is not a word the Developers Console, the docs or the SDK
// use, and it told a developer nothing about who may call a route or what the
// route acts on. Refunds shed it first; the rest of the surface has now
// followed — payment sessions, wallet accounts, transfers, webhooks,
// application settlements, and the integration state that used to be
// /business/me.
//
// Two resources were mounted TWICE before this: once under /v1 for a merchant
// JWT and once under /v1/business for a project key. ADR-047 §5 calls for a
// single mount per resource carrying both credentials, and chi cannot hold two
// routes on one path in any case. They are unified rather than renamed.
//
// No compatibility alias survives. Nothing has launched against these paths, so
// an alias would only preserve a vocabulary we are removing.

import (
	"net/http"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

func TestPublicDeveloperSurface_HasNoLegacyBusinessNamespace(t *testing.T) {
	var legacy []string
	for route := range registeredRoutes(t) {
		if strings.Contains(route, "/v1/busi"+"ness/") {
			legacy = append(legacy, route)
		}
	}
	if len(legacy) != 0 {
		t.Errorf("PUBLIC_DEVELOPER_LEGACY_BUSINESS_ROUTES = %d, want 0: %v", len(legacy), legacy)
	}
}

// The rename must not have quietly dropped a resource on the way. Each canonical
// path is asserted present, so "no /business routes" cannot be satisfied by
// having no routes at all.
func TestPublicDeveloperSurface_CanonicalResourcesArePresent(t *testing.T) {
	routes := registeredRoutes(t)
	for _, want := range []string{
		"POST /v1/payment-sessions/",
		"GET /v1/payment-sessions/",
		"POST /v1/wallet-accounts/",
		"GET /v1/wallet-accounts/",
		"POST /v1/application-settlements/",
		"POST /v1/wallet-account-transfers/",
		"POST /v1/webhooks/endpoints",
		"GET /v1/webhooks/events",
		"GET /v1/integration",
		"POST /v1/refunds/",
	} {
		if !routes[want] {
			t.Errorf("%s is not mounted — the canonical surface lost a resource in the rename", want)
		}
	}
}

// The retired path named the caller rather than the thing described, in a
// vocabulary the public product does not use. The literals below are split so a
// future path sweep cannot silently rewrite the guard into tautology — which is
// exactly what happened once.
func TestPublicDeveloperSurface_IntegrationStateReplacedBusinessMe(t *testing.T) {
	routes := registeredRoutes(t)
	if routes["GET /v1/busi"+"ness/me"] {
		t.Error("the retired business/me route is still mounted")
	}
	if !routes["GET /v1/integration"] {
		t.Error("GET /v1/integration is not mounted — the Business's own dashboard state has no route")
	}
}

// A Project reads its readiness from one Project-scoped resource, mounted on the
// developer-key surface beside /v1/me — never on the merchant surface, and never
// under a Project id the caller supplies.
func TestPublicDeveloperSurface_ProjectReadinessIsProjectScoped(t *testing.T) {
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
	if !routes["GET /v1/financial-setup"] {
		t.Fatal("GET /v1/financial-setup is not mounted on the developer-key surface")
	}
	for route := range routes {
		if strings.Contains(route, "financial-setup") && route != "GET /v1/financial-setup" {
			t.Errorf("unexpected readiness route %s — one resource, Project key as authority", route)
		}
	}
}

// Webhooks and application settlements were each mounted twice, once per
// credential. Exactly one mount must survive.
func TestPublicDeveloperSurface_NoResourceIsMountedTwice(t *testing.T) {
	routes := registeredRoutes(t)
	for _, pair := range [][2]string{
		{"POST /v1/webhooks/endpoints", "POST /v1/busi" + "ness/webhooks/endpoints"},
		{"POST /v1/application-settlements/", "POST /v1/busi" + "ness/application-settlements/"},
	} {
		if routes[pair[1]] {
			t.Errorf("%s still exists beside %s — one resource, two mounts", pair[1], pair[0])
		}
		if !routes[pair[0]] {
			t.Errorf("%s is missing — unifying the mounts must not remove the resource", pair[0])
		}
	}
}

// Every route a Project key reaches through the dual-credential group carries
// the owner-identifier redaction (ADR-057). Asserted on the mounted chain, so
// a route group added without it — or the Use line removed — fails here.
func TestPublicDeveloperSurface_ProjectKeyRoutesRedactTheOwner(t *testing.T) {
	r := newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret:               "0123456789abcdef0123456789abcdef",
		DeveloperKeyAuthEnabled: true,
		DeveloperInternalKey:    "internal-test-credential",
		DeveloperAPIURL:         "http://developer-api",
	}, Dependencies{})
	want := runtime.FuncForPC(reflect.ValueOf(middleware.RedactOwnerIdentifiers).Pointer()).Name()
	checked := 0
	_ = chi.Walk(r, func(method, route string, _ http.Handler, mws ...func(http.Handler) http.Handler) error {
		for _, p := range []string{"/v1/payment-sessions", "/v1/refunds", "/v1/webhooks", "/v1/wallet-accounts", "/v1/application-settlements"} {
			if !strings.HasPrefix(route, p) {
				continue
			}
			checked++
			found := false
			for _, mw := range mws {
				if runtime.FuncForPC(reflect.ValueOf(mw).Pointer()).Name() == want {
					found = true
				}
			}
			if !found {
				t.Errorf("%s %s is reachable with a Project key without owner redaction", method, route)
			}
		}
		return nil
	})
	if checked < 10 {
		t.Fatalf("checked %d routes — the walk found too few to mean anything", checked)
	}
}
