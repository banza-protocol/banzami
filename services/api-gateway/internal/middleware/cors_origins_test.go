package middleware

import "testing"

// Every browser origin Banzami serves must be able to call the Gateway.
//
// developers.banzami.com moved to its own host and was never added to this
// allowlist, so the Developer Console's platform-mode call was refused by CORS
// on every page load. The list is short and the cost of an omission is a
// surface that silently cannot talk to its own API, so it is asserted rather
// than reviewed.
func TestCORS_AllowsEveryBanzamiBrowserSurface(t *testing.T) {
	for _, origin := range []string{
		"https://banzami.com",
		"https://www.banzami.com",
		"https://developers.banzami.com",
		"https://pay.banzami.com",
	} {
		if !isAllowedOrigin(origin) {
			t.Errorf("origin %s is not allowed — a Banzami surface cannot call the Gateway", origin)
		}
	}
}

// The allowlist is an allowlist. A look-alike host must not pass.
func TestCORS_RefusesEverythingElse(t *testing.T) {
	for _, origin := range []string{
		"https://banzami.com.attacker.example",
		"https://evil.example",
		"http://banzami.com", // scheme matters
		"https://developers.banzami.com.attacker.example",
		"",
	} {
		if isAllowedOrigin(origin) {
			t.Errorf("origin %q was allowed and must not be", origin)
		}
	}
}
