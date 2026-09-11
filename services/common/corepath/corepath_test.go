package corepath

import "testing"

func TestWellFormed(t *testing.T) {
	for _, tc := range []struct {
		path string
		ok   bool
	}{
		{"/internal/v1/refunds/abc?merchant_id=m", true},
		{"/internal/v1/merchant-profiles/by-handle/%2564oa", true},
		{"/internal/v1/refunds?limit=20&source_id=s%26merchant_id%3Dv&merchant_id=m", true},
		{"/internal/v1/refunds/abc?merchant_id=v&x=?merchant_id=m", false},
		{"/internal/v1/refunds?limit=20&source_id=s&merchant_id=v&merchant_id=m", false},
		{"/internal/v1/wallets/../merchants/x", false},
		{"/internal/v1/wallets/%2e%2e/merchants/x", false},
		{"/internal/v1/wallets/x#frag", false},
		{"/internal/v1/wallets/x y", false},
		{"/internal/v1/compliance/merchants/x/../../risk/freeze/approve", false},
	} {
		if got := WellFormed(tc.path); got != tc.ok {
			t.Errorf("WellFormed(%q) = %v, want %v", tc.path, got, tc.ok)
		}
	}
}
