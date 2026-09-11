package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// A2-17: GET /v1/platform-mode used to answer 200 {"mode":"SANDBOX"} when the
// mode could not be read, so a caller could not tell "the platform is in
// Sandbox" from "nobody knows". The verifier then asked the Sandbox stack. An
// unreadable mode is now a 503 — every existing reader (banner, pay page,
// dashboard) already treats a non-2xx as "show the Sandbox banner", so only a
// caller that must not guess behaves differently.
func TestPlatformMode_UnknownModeIsUnavailableNotSandbox(t *testing.T) {
	for name, h := range map[string]*PlatformHandler{
		"no service":      NewPlatformHandler(nil),
		"unreadable mode": NewPlatformHandler(service.NewPlatformReadService(nil)),
	} {
		rec := httptest.NewRecorder()
		h.Mode(rec, httptest.NewRequest(http.MethodGet, "/v1/platform-mode", nil))
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: status = %d, want 503 (%s)", name, rec.Code, rec.Body.String())
		}
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if body["mode"] == "SANDBOX" || body["mode"] == "LIVE" {
			t.Fatalf("%s: an unknown mode was reported as %v", name, body["mode"])
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("%s: an unavailable answer must not be cached (Cache-Control %q)", name, cc)
		}
	}
}
