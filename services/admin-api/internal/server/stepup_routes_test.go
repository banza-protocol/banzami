package server

import (
	"os"
	"regexp"
	"testing"
)

// A5-08. The highest-risk routes carry the step-up gate on top of their
// capability: a session alone cannot create or re-arm an operator, reset
// another operator's credentials or sessions, reprice a customer, move
// settlement or payout state, credit a wallet, freeze or close an account,
// resolve a dispute, mint a Business credential or flip the platform mode.
//
// Read from the route table, as the notification test does: the gate is a
// closure argument, and building the router needs a live operator store. The
// behaviour of the gate itself is proven in handler/session_test.go.
func TestStepUp_GuardsTheHighestRiskRoutes(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range []struct{ method, route string }{
		// Operators: a stolen session could otherwise mint a SUPER_ADMIN invited
		// to the attacker's address, which survives the victim's password change.
		{"Post", `"/admin/v1/operators"`},
		{"Post", `"/admin/v1/operators/{id}/role"`},
		{"Post", `"/admin/v1/operators/{id}/suspend"`},
		{"Post", `"/admin/v1/operators/{id}/activate"`},
		{"Post", `"/admin/v1/operators/{id}/resend-invite"`},
		{"Post", `"/admin/v1/operators/{id}/password-reset"`},
		{"Post", `"/admin/v1/operators/{id}/terminate-sessions"`},
		// Pricing and fee eligibility.
		{"Put", `"/admin/v1/merchants/{id}/pricing-profile"`},
		{"Patch", `"/admin/v1/merchants/{id}/business-account-type"`},
		{"Post", `"/admin/v1/finance/pricing-rules"`},
		{"Patch", `"/admin/v1/finance/pricing-rules/{id}"`},
		{"Post", `"/admin/v1/finance/pricing-rules/{id}/disable"`},
		{"Post", `"/admin/v1/finance/pricing-rules/{id}/enable"`},
		{"Post", `"/admin/v1/finance/pricing-rules/{id}/duplicate"`},
		{"Post", `base`},
		{"Patch", `base+"/{id}"`},
		{"Post", `base+"/{id}/disable"`},
		{"Post", `base+"/{id}/enable"`},
		// Settlements, application settlements, payouts, money.
		{"Post", `"/admin/v1/settlements"`},
		{"Post", `"/admin/v1/settlements/{id}/submit"`},
		{"Post", `"/admin/v1/settlements/{id}/confirm"`},
		{"Post", `"/admin/v1/settlements/{id}/fail"`},
		{"Post", `"/admin/v1/finance/application-settlements/{id}/cancel"`},
		{"Post", `"/admin/v1/finance/application-settlements/{id}/fail"`},
		{"Post", `"/admin/v1/payouts/{id}/process"`},
		{"Post", `"/admin/v1/payouts/{id}/sent"`},
		{"Post", `"/admin/v1/payouts/{id}/confirm"`},
		{"Post", `"/admin/v1/payouts/{id}/fail"`},
		{"Post", `"/admin/v1/payouts/{id}/returned"`},
		{"Post", `"/admin/v1/wallets/{id}/credit"`},
		{"Post", `"/admin/v1/disputes/{id}/resolve"`},
		// Freezes and closure.
		{"Post", `"/admin/v1/risk/freeze"`},
		{"Delete", `"/admin/v1/risk/freeze/{entity_type}/{entity_id}"`},
		{"Post", `"/admin/v1/wallet-accounts/{id}/close"`},
		// Credentials a Business is taken over with.
		{"Post", `"/admin/v1/merchant-applications/{id}/reissue-activation"`},
		{"Post", `"/admin/v1/businesses/{id}/app-pin-reset"`},
		// The platform's money mode.
		{"Post", `"/admin/v1/platform/mode"`},
	} {
		re := regexp.MustCompile(`r\.With\((cap\(auth\.\w+\)(?:, \w+)*)\)\.` + r.method + `\(` + regexp.QuoteMeta(r.route) + `,`)
		m := re.FindAllStringSubmatch(string(src), -1)
		if len(m) != 1 {
			t.Fatalf("%s %s: want exactly one route, found %d", r.method, r.route, len(m))
		}
		if !regexp.MustCompile(`\bstepUp\b`).MatchString(m[0][1]) {
			t.Errorf("%s %s is served without the step-up gate: r.With(%s)", r.method, r.route, m[0][1])
		}
	}
	if !regexp.MustCompile(`\.Post\("/admin/v1/auth/step-up", mfaH\.StepUp\)`).Match(src) {
		t.Error("POST /admin/v1/auth/step-up is not routed — the gate would be unpassable")
	}
}
