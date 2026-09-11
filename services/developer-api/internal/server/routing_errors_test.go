package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/config"
)

// An unknown route or a wrong method answers in this service's error envelope.
func TestRoutingErrorsUseTheErrorEnvelope(t *testing.T) {
	h := New(&config.Config{Environment: "sandbox", ConsoleOrigin: "https://developers.banzami.com"}, Deps{})
	for _, tc := range []struct {
		method, path string
		status       int
		code         string
	}{
		{"GET", "/v1/no-such-route", 404, "NOT_FOUND"},
		{"DELETE", "/health", 405, "METHOD_NOT_ALLOWED"},
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != tc.status || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s %s: %d %q %q", tc.method, tc.path, w.Code, w.Header().Get("Content-Type"), w.Body.String())
		}
		var body struct {
			Error struct{ Code string } `json:"error"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Error.Code != tc.code {
			t.Fatalf("%s %s: body %q", tc.method, tc.path, w.Body.String())
		}
	}
}
