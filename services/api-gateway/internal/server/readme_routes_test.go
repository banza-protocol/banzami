package server

// The service README's route table is the mounted route table.
//
// services/api-gateway/README.md once listed four consumer-wallet routes that
// were unmounted (RA-058) and omitted 75 that were mounted, including every
// route a project key can call (audit finding A4-11). Nothing compared the two.
// This walks the router — Sandbox, with every optional surface enabled
// (developer-key auth, Business PIN reset), which is the fullest route set any
// stack mounts — and requires the README to list exactly those routes, one row
// per method and path.

import (
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

var readmeRouteRow = regexp.MustCompile(`^\| (GET|POST|PUT|PATCH|DELETE|ANY) \| (/\S*) \|`)

// allMethods is what chi registers for r.Handle: every method, reported one by one.
var allMethods = []string{"CONNECT", "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "TRACE"}

func normRoute(p string) string {
	if p != "/" {
		p = strings.TrimSuffix(p, "/")
	}
	return p
}

// fullSandboxRoutes: "METHOD /path" for every route, with a path answering every
// method collapsed to "ANY /path".
func fullSandboxRoutes(t *testing.T) map[string]bool {
	t.Helper()
	r := newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret:               "0123456789abcdef0123456789abcdef",
		DeveloperKeyAuthEnabled: true,
		DeveloperInternalKey:    "readme-route-test",
		DeveloperAPIURL:         "http://developer-api:8090",
	}, Dependencies{BusinessPinResetSvc: &service.BusinessPinResetService{}})

	byPath := map[string]map[string]bool{}
	err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		p := normRoute(route)
		if byPath[p] == nil {
			byPath[p] = map[string]bool{}
		}
		byPath[p][method] = true
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	out := map[string]bool{}
	for p, methods := range byPath {
		everyMethod := true
		for _, m := range allMethods {
			everyMethod = everyMethod && methods[m]
		}
		if everyMethod {
			out["ANY "+p] = true
			continue
		}
		for m := range methods {
			out[m+" "+p] = true
		}
	}
	return out
}

// readmeRoutes parses the README's route table rows.
func readmeRoutes(t *testing.T, readme string) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	for _, line := range strings.Split(readme, "\n") {
		if m := readmeRouteRow.FindStringSubmatch(line); m != nil {
			out[m[1]+" "+normRoute(m[2])] = true
		}
	}
	return out
}

func diffRoutes(a, b map[string]bool) []string {
	var out []string
	for k := range a {
		if !b[k] {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

func TestReadmeRouteTable_MatchesTheMountedRoutes(t *testing.T) {
	raw, err := os.ReadFile("../../README.md")
	if err != nil {
		t.Fatalf("read README: %v", err)
	}
	mounted := fullSandboxRoutes(t)
	documented := readmeRoutes(t, string(raw))

	// Non-vacuity: both sides are the real, large sets.
	if len(mounted) < 120 {
		t.Fatalf("walked only %d routes — the router did not build its full surface", len(mounted))
	}
	if len(documented) < 120 {
		t.Fatalf("parsed only %d README rows — the table format changed under the parser", len(documented))
	}

	if missing := diffRoutes(mounted, documented); len(missing) > 0 {
		t.Errorf("%d mounted route(s) missing from services/api-gateway/README.md:\n  %s",
			len(missing), strings.Join(missing, "\n  "))
	}
	if extra := diffRoutes(documented, mounted); len(extra) > 0 {
		t.Errorf("%d README route(s) not mounted by the gateway:\n  %s",
			len(extra), strings.Join(extra, "\n  "))
	}
}

// The comparison fails for the reasons it exists: an unmounted route in the
// table, and a mounted route left out of it.
func TestReadmeRouteTable_ComparisonCatchesDrift(t *testing.T) {
	mounted := fullSandboxRoutes(t)
	doc := readmeRoutes(t, "| POST | /v1/consumer-wallets | stale |\n| GET | /health | Liveness |\n")
	if extra := diffRoutes(doc, mounted); len(extra) != 1 || extra[0] != "POST /v1/consumer-wallets" {
		t.Errorf("an unmounted README route was not reported: %v", extra)
	}
	if missing := diffRoutes(mounted, doc); len(missing) != len(mounted)-1 {
		t.Errorf("mounted routes absent from the table were not all reported: %d of %d", len(missing), len(mounted)-1)
	}
}
