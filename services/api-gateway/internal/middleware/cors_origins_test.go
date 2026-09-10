package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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

// A browser sends a preflight naming the headers it is about to use, and drops
// the request when any of them is not allowed — the page sees only a network
// error. The public Business application sends Idempotency-Key; the preflight
// must allow it, or no application can be submitted from banzami.com at all.
func TestCORS_PreflightAllowsTheHeadersBrowserSurfacesSend(t *testing.T) {
	h := CORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	req := httptest.NewRequest(http.MethodOptions, "/v1/merchant/applications", nil)
	req.Header.Set("Origin", "https://banzami.com")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type,idempotency-key")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	allowed := map[string]bool{}
	for _, v := range strings.Split(rec.Header().Get("Access-Control-Allow-Headers"), ",") {
		allowed[strings.ToLower(strings.TrimSpace(v))] = true
	}
	for _, want := range []string{"content-type", "idempotency-key", "authorization"} {
		if !allowed[want] {
			t.Errorf("preflight does not allow %q — the browser will drop the request (allowed: %q)",
				want, rec.Header().Get("Access-Control-Allow-Headers"))
		}
	}
}
