package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Route-level test for the Split Sessions supersession at the gateway edge.
// The router is built with NO core client and NO service dependency — exactly
// how the real gateway registers it — so a passing 410 (never a 502/500) is
// itself proof that Core is not called for these paths.
func splitsRouter() http.Handler {
	r := chi.NewRouter()
	h := SplitsSuperseded() // no service, no core client — cannot reach Core
	r.Handle("/v1/splits", h)
	r.Handle("/v1/splits/*", h)
	return r
}

// The full legacy Split Sessions surface: list/create, detail, pay, unsupported
// methods, malformed identifiers and nested paths.
func splitCases() []struct{ method, path string } {
	return []struct{ method, path string }{
		{"POST", "/v1/splits"},                      // create
		{"GET", "/v1/splits"},                       // list / unsupported-on-create
		{"GET", "/v1/splits/abc123"},                // detail
		{"POST", "/v1/splits/abc123/pay"},           // pay
		{"PUT", "/v1/splits/abc123"},                // unsupported method
		{"DELETE", "/v1/splits/abc123"},             // unsupported method
		{"PATCH", "/v1/splits/abc123"},              // unsupported method
		{"HEAD", "/v1/splits/abc123"},               // HEAD
		{"GET", "/v1/splits/%20%20"},                // malformed id
		{"GET", "/v1/splits/not-a-uuid"},            // malformed id
		{"POST", "/v1/splits/abc123/anything/deep"}, // nested legacy path
	}
}

func TestSplits_EveryLegacyRouteReturns410Superseded(t *testing.T) {
	router := splitsRouter()
	for _, c := range splitCases() {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(c.method, c.path, nil))

			// (1) 410 Gone — never 500, never 502, never a generic 404/upstream.
			if rec.Code != http.StatusGone {
				t.Fatalf("status = %d, want 410 (body %q)", rec.Code, rec.Body.String())
			}

			// HEAD carries no body — status is the whole contract there.
			if c.method == "HEAD" {
				return
			}

			// (3) exact standard error envelope + code + message.
			var env struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
				t.Fatalf("body is not the standard envelope: %v (%q)", err, rec.Body.String())
			}
			if env.Error.Code != "SPLIT_SESSIONS_SUPERSEDED" {
				t.Fatalf("code = %q, want SPLIT_SESSIONS_SUPERSEDED", env.Error.Code)
			}
			if env.Error.Message != "Split Sessions foi substituído por Collections." {
				t.Fatalf("message = %q", env.Error.Message)
			}
			if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Fatalf("content-type = %q, want application/json", ct)
			}

			// (2)+(5) no leak of Core/DB/SQL/table/upstream/status detail. Lowercase
			// table names would only appear via a SQL error — the intended code is
			// uppercase (SPLIT_SESSIONS_SUPERSEDED), so check the RAW body for them.
			body := rec.Body.String()
			for _, raw := range []string{"split_sessions", "split_participants", "0042", "/internal/v1"} {
				if strings.Contains(body, raw) {
					t.Fatalf("response leaked %q: %s", raw, body)
				}
			}
			low := strings.ToLower(body)
			for _, bad := range []string{
				"migration", "relation", "does not exist", "sqlx", "postgres",
				"select ", "insert ", "upstream", "502", "500", "internal_error",
			} {
				if strings.Contains(low, bad) {
					t.Fatalf("response leaked %q: %s", bad, body)
				}
			}
		})
	}
}

func TestSplits_NoCoreCall_SelfContained410(t *testing.T) {
	// The handler has no service/core dependency by construction; with no Core
	// backend reachable, a proxy would 502. Getting a clean 410 proves the edge
	// answers directly without calling Core.
	rec := httptest.NewRecorder()
	splitsRouter().ServeHTTP(rec, httptest.NewRequest("POST", "/v1/splits", strings.NewReader(`{"total_minor":1000}`)))
	if rec.Code != http.StatusGone {
		t.Fatalf("status = %d, want 410", rec.Code)
	}
	if rec.Code == http.StatusBadGateway || rec.Code == http.StatusInternalServerError {
		t.Fatalf("must never be 502/500 for a superseded route")
	}
}
