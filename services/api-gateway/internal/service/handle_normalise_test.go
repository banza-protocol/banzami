package service

import "testing"

// A3-07: a handle has one spelling. strings.ToLower mapped 'İ' and the Kelvin
// sign onto ASCII letters, so "İvo" named @ivo; they are now left as they are
// and refused.
func TestNormaliseHandle_ASCIIOnly(t *testing.T) {
	if got := NormaliseHandle("  @Ana_M "); got != "ana_m" {
		t.Fatalf("got %q", got)
	}
	for _, alias := range []string{"İvo", "Kilo"} {
		if err := ValidateHandle(NormaliseHandle(alias)); err == nil {
			t.Fatalf("%q normalised to a valid handle %q", alias, NormaliseHandle(alias))
		}
	}
}
