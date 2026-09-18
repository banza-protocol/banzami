package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/validation"
)

// The overview is the first thing the Studio renders, and the browser reads
// every field of it. A field the handler forgets to send arrives as `undefined`
// and white-screens the page — which is exactly what happened: the struct was
// extended in one place and the response in another, and nothing failed until a
// person opened the page.
//
// So the contract is asserted here, against the marshalled response, rather
// than trusted to stay in sync.
func TestOverview_CarriesEveryFieldTheStudioReads(t *testing.T) {
	reg := validation.MustLoad()
	h := NewValidationHandler(reg, validation.NewPreflighter(nil, reg, nil), nil)

	rec := httptest.NewRecorder()
	h.Overview(rec, httptest.NewRequest(http.MethodGet, "/admin/v1/validation/overview", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("overview returned %d", rec.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("overview is not JSON: %v", err)
	}

	for _, field := range []string{
		"environment", "registry_digest", "actors", "suites", "profiles",
		"active_run", "recent_runs", "runs_ever_started",
		"coverage", "components", "blocking_issues",
	} {
		if _, ok := body[field]; !ok {
			t.Errorf("overview omits %q; the dashboard reads it and would crash on undefined", field)
		}
	}

	// A nil slice marshals as `null`, and `null.length` throws. Only the fields
	// that are legitimately absent may be null.
	nullable := map[string]bool{"active_run": true}
	for k, v := range body {
		if v == nil && !nullable[k] {
			t.Errorf("overview sends %q as null; a consumer counting it would crash", k)
		}
	}

	// Coverage is an object, not a number, and the dashboard reads its parts.
	cov, ok := body["coverage"].(map[string]any)
	if !ok {
		t.Fatal("coverage is not an object")
	}
	for _, field := range []string{
		"suites", "suites_declared", "suites_with_journeys",
		"journeys", "journeys_automated", "journeys_runtime_proven",
	} {
		if _, ok := cov[field]; !ok {
			t.Errorf("coverage omits %q", field)
		}
	}

	// Present is not the same as populated: a struct field that is declared but
	// never filled marshals as a zero object, which reads on screen as "nothing
	// is declared" — a lie in the opposite direction.
	if n, _ := cov["suites"].(float64); int(n) != len(reg.Suites) {
		t.Errorf("coverage reports %v suites, the registry has %d — it was not populated",
			cov["suites"], len(reg.Suites))
	}
	if n, _ := body["suites"].(float64); int(n) != len(reg.Suites) {
		t.Errorf("overview reports %v suites, the registry has %d", body["suites"], len(reg.Suites))
	}
}

// Nothing the Studio serves may carry a credential value or say where one lives.
func TestValidationResponses_CarryNoSecret(t *testing.T) {
	reg := validation.MustLoad()
	h := NewValidationHandler(reg, validation.NewPreflighter(nil, reg, nil), nil)

	for name, call := range map[string]func(http.ResponseWriter, *http.Request){
		"overview":   h.Overview,
		"actors":     h.Actors,
		"profiles":   h.Profiles,
		"catalogue":  h.Catalogue,
		"components": h.Components,
		"assurance":  h.Assurance,
	} {
		rec := httptest.NewRecorder()
		call(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
		blob := strings.ToLower(rec.Body.String())
		for _, forbidden := range []string{
			"secret://", "/run/secrets/", "postgres://", "postgresql://",
			"__host-", "bearer ", "private key",
		} {
			if strings.Contains(blob, forbidden) {
				t.Errorf("%s response contains %q", name, forbidden)
			}
		}
	}
}
