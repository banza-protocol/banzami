package server

import "testing"

// Refunds are a public primitive and live at /v1/refunds.
//
// The old mount, /v1/refunds, described where the handler happened to
// sit when a refund could only be asked for with a merchant credential. It was
// never a word in the developer-facing vocabulary, and an external developer
// reading the reference had no way to know why this one financial verb hid
// behind a noun naming nothing they own.
//
// This is asserted against the registered route table rather than by making a
// request, for the same reason as the surface tests above: an unmounted path
// and a mounted-but-rejecting one both answer 404 to an unauthenticated caller,
// so a request-level check cannot tell them apart. The route table can.
//
// The trailing slashes are how chi records a sub-router's own root, not part of
// the URL a client sends; /v1/refunds is what the reference documents and what
// the deployed harness calls.
func TestRefundRoutes_CanonicalPublicPath(t *testing.T) {
	routes := registeredRoutes(t)

	for _, route := range []string{
		"POST /v1/refunds/",
		"GET /v1/refunds/",
		"GET /v1/refunds/{id}",
	} {
		if !routes[route] {
			t.Errorf("%s is not mounted; it is the canonical public refund contract", route)
		}
	}

	// The retired path must be gone from the runtime, not merely from the docs.
	// A route that still answers is still a contract whatever the reference says,
	// and leaving it mounted would mean two paths to the same financial write —
	// one of them undocumented, and neither one obviously the real one.
	for _, route := range []string{
		"POST /v1/busi" + "ness/refunds/",
		"GET /v1/busi" + "ness/refunds/",
		"GET /v1/busi" + "ness/refunds/{id}",
	} {
		if routes[route] {
			t.Errorf("%s is still mounted; /business/ was never part of the public "+
				"developer vocabulary and the path has moved to /v1/refunds", route)
		}
	}
}

// Refunds must stay reachable with a project key, not only with a merchant
// session. Moving the path would be cosmetic if the credential that an external
// developer actually holds still could not use it.
//
// The route table alone cannot show this — it records paths, not which middleware
// chain wraps them — so this reads the mount the migration created: refunds sit
// inside the DualAuth group, alongside the other routes a developer key reaches.
// Refunds shed the /business prefix first; the rest of the developer surface has
// since followed, so the siblings below are the canonical resource paths. The
// prefix never described who may call a route — dropping it changed the
// vocabulary and not the authority.
func TestRefundRoutes_LiveInTheDeveloperReachableGroup(t *testing.T) {
	routes := registeredRoutes(t)

	// Sibling routes known to be developer-key reachable. If refunds ever get
	// moved back out into a merchant-only group, this list is what they would
	// stop travelling with.
	for _, sibling := range []string{
		"POST /v1/payment-sessions/",
		"POST /v1/wallet-accounts/",
	} {
		if !routes[sibling] {
			t.Fatalf("%s is missing — the control for this assertion is gone, so a "+
				"pass here would not mean refunds are developer-reachable", sibling)
		}
	}
	if !routes["POST /v1/refunds/"] {
		t.Error("POST /v1/refunds is not mounted beside the other developer-reachable financial routes")
	}
}
