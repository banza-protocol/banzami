package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
)

// An unknown route or a wrong method answers in the documented error shape —
// {code, message, request_id} as JSON — like every other error.
func TestRoutingErrorsUseTheErrorContract(t *testing.T) {
	r := newRouter(&config.Config{Port: 8080, Environment: "SANDBOX", JWTSecret: "0123456789abcdef0123456789abcdef"}, Dependencies{})
	for _, tc := range []struct {
		method, path string
		status       int
		code         string
	}{
		{"GET", "/no-such-route", 404, "NOT_FOUND"},
		{"GET", "/v1/public/no-such-route", 404, "NOT_FOUND"},
		{"DELETE", "/health", 405, "METHOD_NOT_ALLOWED"},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != tc.status {
			t.Fatalf("%s %s: status %d, want %d", tc.method, tc.path, w.Code, tc.status)
		}
		if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("%s %s: content-type %q, body %q", tc.method, tc.path, ct, w.Body.String())
		}
		var body struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Code != tc.code || body.Message == "" {
			t.Fatalf("%s %s: body %q (err %v)", tc.method, tc.path, w.Body.String(), err)
		}
	}
}

// The SDK calls /v1/public/pay; the pay page calls /public/pay. Both reach the
// same handlers — and under both, the POST carries the initiate limit its
// sibling GET does not (one middleware more).
func TestPublicPayIsMountedUnderBothPrefixes(t *testing.T) {
	r := newRouter(&config.Config{Port: 8080, Environment: "SANDBOX", JWTSecret: "0123456789abcdef0123456789abcdef"}, Dependencies{})
	chain := map[string]int{}
	_ = chi.Walk(r, func(method, route string, _ http.Handler, mws ...func(http.Handler) http.Handler) error {
		chain[method+" "+route] = len(mws)
		return nil
	})
	for _, p := range []string{"/public/pay", "/v1/public/pay"} {
		get, okGet := chain["GET "+p+"/{slug}"]
		_, okStatus := chain["GET "+p+"/{slug}/status"]
		post, okPost := chain["POST "+p+"/{slug}/pay"]
		if !okGet || !okStatus || !okPost {
			t.Fatalf("%s is not fully mounted (get %v, status %v, pay %v)", p, okGet, okStatus, okPost)
		}
		if post != get+1 {
			t.Errorf("POST %s/{slug}/pay has %d middlewares, its GET %d — the initiate limit is missing", p, post, get)
		}
	}
}
