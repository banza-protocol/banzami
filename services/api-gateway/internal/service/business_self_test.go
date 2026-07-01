package service

import "testing"

func TestPricingCategoryFromLabel(t *testing.T) {
	cases := map[string]string{
		"Doações e causas":       "DONATION",
		"Doacoes":                "DONATION",
		"Vaquinha / crowdfunding": "DONATION",
		"Marketplace":            "MARKETPLACE",
		"Retalho":                "",
		"":                       "",
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
