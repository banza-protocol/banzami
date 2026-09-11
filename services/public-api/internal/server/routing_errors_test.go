package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/config"
)

// An unknown route or a wrong method answers in the documented error shape.
func TestRoutingErrorsUseTheErrorContract(t *testing.T) {
	h := New(&config.Config{Port: 8083, Environment: "sandbox", JWTSecret: "0123456789abcdef0123456789abcdef"}, Dependencies{}).httpServer.Handler
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
		var body struct{ Code string }
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Code != tc.code {
			t.Fatalf("%s %s: body %q", tc.method, tc.path, w.Body.String())
		}
	}
}
