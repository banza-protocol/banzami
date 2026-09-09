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
	"strings"
	"testing"
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
		"POST /v1/transfers/",
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
		t.Error("GET /v1/integration is not mounted — the integration's resolved state has no public route")
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
