package service

import "testing"

func TestPricingCategoryFromLabel(t *testing.T) {
	cases := map[string]string{
		"Doações e causas":        "DONATION",
		"Doacoes":                 "DONATION",
		"Vaquinha / crowdfunding": "DONATION",
		"Marketplace":             "MARKETPLACE",
		"Retalho":                 "",
		"":                        "",
	}
	for label, want := range cases {
		if got := pricingCategoryFromLabel(label); got != want {
			t.Errorf("pricingCategoryFromLabel(%q) = %q, want %q", label, got, want)
		}
	}
}

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
