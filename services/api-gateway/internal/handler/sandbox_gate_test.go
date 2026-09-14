package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The Sandbox gate (SBX-001, ADR-060): a LIVE key is refused on every Sandbox
// test-data route with 403 SANDBOX_ONLY, a Sandbox key without the scope is
// refused with 403 INSUFFICIENT_SCOPE, and a Sandbox key with it is served.
// The routes are also mounted only on a Sandbox stack (server.go), and
// tools/check-live-fail-closed.mjs holds both enforcement points in place.
func TestSandbox_LiveKeyRejectedSandboxAllowed(t *testing.T) {
	h := NewSandboxDevHandler("http://unused", "ik", sbxSessions{}, sbxLinks{})
	noScope := principalA()
	noScope.Scopes = []string{"payment_sessions:write"}
	if rec := post(t, sbxRouter(h, noScope), "/v1/sandbox/test-payers", `{}`, ""); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "INSUFFICIENT_SCOPE") {
		t.Fatalf("missing scope: %d %s", rec.Code, rec.Body)
	}
	live := principalA()
	live.Environment = "LIVE"
	if rec := post(t, sbxRouter(h, live), "/v1/sandbox/test-payers", `{}`, ""); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "SANDBOX_ONLY") {
		t.Fatalf("LIVE principal: %d %s", rec.Code, rec.Body)
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/sandbox/scenarios", nil)
	rec := httptest.NewRecorder()
	sbxRouter(h, principalA()).ServeHTTP(rec, req)
	var cat struct {
		Scenarios []struct {
			ID        string `json:"id"`
			Simulated bool   `json:"simulated"`
		} `json:"scenarios"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &cat) != nil || len(cat.Scenarios) < 20 {
		t.Fatalf("scenario catalogue: %d", rec.Code)
	}
}
