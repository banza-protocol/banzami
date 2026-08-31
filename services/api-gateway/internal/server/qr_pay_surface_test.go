package server

import (
	"strings"
	"testing"
)

// RA-053. POST /v1/qr/pay accepted `payer` as free text on a merchant-only
// surface, and neither the gateway nor core proved the caller could spend that
// consumer's money. KYC blocked the debit in practice, but KYC answers "is this
// customer eligible", never "may this caller spend their money" — and using the
// first as evidence for the second is how an authorization gap hides behind a
// compliance control.
//
// A route-table assertion rather than a status check: a handler returning 403 can
// be re-mounted by accident, but a route absent from the table cannot be reached.
func TestMerchantSurface_QrPayRouteNotMounted(t *testing.T) {
	routes := registeredRoutes(t)
	for route := range routes {
		if strings.Contains(route, "/qr/pay") {
			t.Errorf("QR pay must not be reachable on the merchant surface: %s", route)
		}
	}
}

// Removing the payment route must not silently remove QR issuance with it.
func TestMerchantSurface_QrIssuanceStillMounted(t *testing.T) {
	routes := registeredRoutes(t)
	for _, want := range []string{"POST /v1/qr/dynamic", "POST /v1/qr/static", "POST /v1/qr/decode"} {
		if !routes[want] {
			t.Errorf("%s must still be mounted", want)
		}
	}
}
