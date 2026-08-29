package server

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

func registeredRoutes(t *testing.T) map[string]bool {
	t.Helper()
	r := newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret: "0123456789abcdef0123456789abcdef",
	}, Dependencies{})

	routes := map[string]bool{}
	err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		routes[method+" "+route] = true
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	return routes
}

// SEC-005: the consumer SUSPEND/CLOSE lifecycle actions must not be mounted on
// the merchant surface. They carried no authorisation at all, so any
// authenticated principal could suspend or close ANY consumer account by id.
// They remain available as capability-gated, audited operator actions via
// admin-api → core /internal/v1/consumers/{id}/suspend.
//
// Asserted against the registered route table: a request-level assertion cannot
// tell "absent" from "present but rejecting", because the group's Auth
// middleware runs before chi's NotFound handler.
func TestMerchantSurface_ConsumerLifecycleRoutesNotMounted(t *testing.T) {
	routes := registeredRoutes(t)

	for _, route := range []string{
		"POST /v1/consumers/{id}/suspend",
		"POST /v1/consumers/{id}/close",
	} {
		if routes[route] {
			t.Errorf("%s is mounted on the merchant surface; consumer lifecycle "+
				"actions belong to the capability-gated operator surface", route)
		}
	}
}

// SEC-015 / SEC-018: consumer-to-consumer P2P transfers are not a merchant
// resource and must not be mounted on the merchant surface at all.
//
// A P2P transfer has two CONSUMER participants and no merchant party, so there
// is no ownership relation a merchant principal could be scoped against. That is
// not a missing field — it is the absence of authority, and the fix is to remove
// the capability rather than to invent a merchant_id on the financial model.
//
// Each route took its subject straight from client input, so a merchant
// credential could move any consumer's money (POST names sender_id), read any
// transfer (GET /{id}), or read any consumer's entire history
// (GET ?consumer_id=). The sender-KYC gate did not help: it authorised the
// SENDER named in the body, never the caller.
//
// The consumer-scoped equivalents live on public-api, where the sender is
// derived from the authenticated consumer token and reads are restricted to a
// transfer's own sender/recipient.
func TestMerchantSurface_P2PTransferRoutesNotMounted(t *testing.T) {
	routes := registeredRoutes(t)

	for _, route := range []string{
		"POST /v1/transfers",
		"GET /v1/transfers",
		"GET /v1/transfers/{id}",
	} {
		if routes[route] {
			t.Errorf("%s is mounted on the merchant surface; consumer P2P transfers "+
				"are not merchant-readable or merchant-initiable resources", route)
		}
	}
}

// Control: the merchant surface is otherwise intact, so the assertion above
// fails for the right reason rather than because the walk found nothing.
func TestMerchantSurface_ExpectedRoutesStillMounted(t *testing.T) {
	routes := registeredRoutes(t)

	for _, route := range []string{
		"GET /v1/consumers/{id}",
		"GET /v1/wallets/{id}",
		"GET /v1/wallets/{id}/balance",
		"POST /v1/merchants/{id}/api-keys",
	} {
		if !routes[route] {
			t.Errorf("expected route %s to remain mounted; the route walk is not "+
				"observing the merchant surface", route)
		}
	}
}
