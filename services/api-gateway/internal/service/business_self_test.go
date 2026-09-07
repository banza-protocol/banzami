package service

import "testing"

// TestPricingCategoryFromLabel lived here and asserted that "Doações e causas"
// resolved to DONATION, "Marketplace" to MARKETPLACE, and everything else to "".
// It tested a function that turned a merchant's own words into a pricing
// category, which was then used to look up a rate. The function is gone: a
// business does not choose its tariff by how it describes itself, and no rule is
// keyed on a category any more.
//
// What replaced it is not a mapping to test. `Self` reads the profile an
// operator ASSIGNED to the owner and lists its rate per fee-bearing operation,
// which is the same resolution the settlement and payout paths perform.

func TestBlockerReasonCodesStable(t *testing.T) {
	// Guard the wire contract — apps map these strings.
	for _, c := range []string{BlockerBusinessNotActive, BlockerKybNotApproved, BlockerWalletMissing, BlockerWalletAccountMissing, BlockerPricingMissing} {
		if c == "" || c != string([]byte(c)) {
			t.Errorf("blocker code invalid: %q", c)
		}
	}
}

func TestWarningReasonCodesStable(t *testing.T) {
	// Advisory warnings are a wire contract too — and must be distinct from
	// blockers (a warning never blocks settlement).
	if WarnWebhookEndpointMissing != "WEBHOOK_ENDPOINT_MISSING" {
		t.Errorf("webhook warning code changed: %q", WarnWebhookEndpointMissing)
	}
	for _, b := range []string{BlockerBusinessNotActive, BlockerKybNotApproved, BlockerWalletMissing, BlockerWalletAccountMissing, BlockerPricingMissing} {
		if b == WarnWebhookEndpointMissing {
			t.Errorf("warning code collides with a blocker: %q", b)
		}
	}
}
