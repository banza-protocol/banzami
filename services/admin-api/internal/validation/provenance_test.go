package validation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// gatewayStub answers /health the way the deployed gateway does.
func gatewayStub(t *testing.T, build string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "build": build})
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func collectorFor(t *testing.T, adminRev, gatewayBuild string) *ProvenanceCollector {
	t.Helper()
	c := NewProvenanceCollector(nil, gatewayStub(t, gatewayBuild))
	c.env = func(k string) string {
		if k == "BANZAMI_BUILD_COMMIT" {
			return adminRev
		}
		return ""
	}
	return c
}

// The defining property: the revision recorded is the DEPLOYED one, read from
// the running process and the running gateway — never the repository's HEAD,
// which is a different thing and usually a different commit.
func TestProvenance_RecordsTheDeployedRevisionNotRepoHead(t *testing.T) {
	const deployed = "5c6b2ac6b405"
	c := collectorFor(t, deployed, "1bf03679d508")

	rows, err := c.Collect(context.Background())
	// No pool in this test, so the schema component is legitimately missing.
	if err == nil {
		t.Fatal("expected the schema component to be reported missing without a database")
	}

	got := map[string]string{}
	for _, r := range rows {
		got[r.Component] = r.Revision
	}
	if got[ComponentAdminAPI] != deployed {
		t.Errorf("admin-api revision %q, want the deployed %q", got[ComponentAdminAPI], deployed)
	}
	if got[ComponentGateway] != "1bf03679d508" {
		t.Errorf("gateway revision %q, want what /health reported", got[ComponentGateway])
	}
	if got[ComponentRegistry] != RegistryDigest {
		t.Errorf("registry digest %q, want the compiled-in %q", got[ComponentRegistry], RegistryDigest)
	}

	// Nothing may have been read from git.
	for _, r := range rows {
		if r.Detail["source"] == "" {
			t.Errorf("%s does not say where its revision came from", r.Component)
		}
		if strings.Contains(strings.ToLower(r.Detail["source"]), "head") ||
			strings.Contains(strings.ToLower(r.Detail["source"]), "git") {
			t.Errorf("%s claims to come from %q; provenance is the deployed revision",
				r.Component, r.Detail["source"])
		}
	}
}

// A component that cannot say what it is must make preparation fail — not be
// recorded as an empty string, "unknown", or omitted in silence.
func TestProvenance_NeverSubstitutesAPlaceholder(t *testing.T) {
	for _, tc := range []struct{ name, adminRev, gatewayBuild string }{
		{"admin-api reports nothing", "", "1bf03679d508"},
		{"admin-api reports the literal unknown", "unknown", "1bf03679d508"},
		{"gateway reports nothing", "5c6b2ac6b405", ""},
		{"gateway reports the literal unknown", "5c6b2ac6b405", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := collectorFor(t, tc.adminRev, tc.gatewayBuild).Collect(context.Background())
			if err == nil {
				t.Fatal("collection succeeded with an unresolvable component")
			}
			for _, r := range rows {
				if r.Revision == "" || r.Revision == "unknown" {
					t.Errorf("%s was recorded with a placeholder revision %q", r.Component, r.Revision)
				}
			}
		})
	}
}

// An unreachable gateway is a failure, not an omission.
func TestProvenance_AnUnreachableComponentIsAFailure(t *testing.T) {
	c := NewProvenanceCollector(nil, "http://127.0.0.1:1")
	c.env = func(string) string { return "5c6b2ac6b405" }
	rows, err := c.Collect(context.Background())
	if err == nil {
		t.Fatal("an unreachable gateway did not fail collection")
	}
	if !strings.Contains(err.Error(), ComponentGateway) {
		t.Errorf("the error does not name the gateway: %v", err)
	}
	for _, r := range rows {
		if r.Component == ComponentGateway {
			t.Error("an unreachable gateway was still recorded")
		}
	}
}

// READY => mandatory provenance complete. The guard that enforces it runs
// inside the preparation transaction; this proves the guard itself.
func TestProvenance_IncompleteSetRefusesReady(t *testing.T) {
	full := []ProvenanceRow{}
	for _, c := range MandatoryComponents() {
		full = append(full, ProvenanceRow{Component: c, Revision: "abc123"})
	}
	if err := requireCompleteProvenance(full); err != nil {
		t.Fatalf("a complete set was refused: %v", err)
	}

	for i, drop := range MandatoryComponents() {
		partial := append([]ProvenanceRow{}, full[:i]...)
		partial = append(partial, full[i+1:]...)
		err := requireCompleteProvenance(partial)
		if err == nil {
			t.Errorf("READY was permitted without %s", drop)
			continue
		}
		if !strings.Contains(err.Error(), drop) {
			t.Errorf("the refusal for a missing %s does not name it: %v", drop, err)
		}
	}

	// A placeholder is not a revision.
	placeholder := append([]ProvenanceRow{}, full[1:]...)
	placeholder = append(placeholder, ProvenanceRow{Component: MandatoryComponents()[0], Revision: "unknown"})
	if err := requireCompleteProvenance(placeholder); err == nil {
		t.Error(`"unknown" was accepted as a revision`)
	}
}

// The mandatory set is a deliberate decision, not an accident of what happened
// to be reachable. It must stay small and stated.
func TestProvenance_TheMandatorySetIsExplicit(t *testing.T) {
	want := map[string]bool{
		ComponentAdminAPI: true, ComponentGateway: true,
		ComponentSchema: true, ComponentRegistry: true,
	}
	got := MandatoryComponents()
	if len(got) != len(want) {
		t.Fatalf("mandatory set has %d components, want %d — changing it is a decision, not a refactor",
			len(got), len(want))
	}
	for _, c := range got {
		if !want[c] {
			t.Errorf("%s joined the mandatory set without the decision being recorded", c)
		}
	}
	// Execution-time components are deliberately absent until a runner exists.
	for _, c := range got {
		for _, deferred := range []string{"core-api", "public-api", "webhook-sink", "app-frontend"} {
			if c == deferred {
				t.Errorf("%s is mandatory, but Phase C never exercises it", c)
			}
		}
	}
}

// Provenance must not become a new place secrets land.
func TestProvenance_CannotCarryASecret(t *testing.T) {
	c := collectorFor(t, "5c6b2ac6b405", "1bf03679d508")
	// Every environment variable the process could read, including ones whose
	// names shout secret. Only BANZAMI_BUILD_COMMIT may be consulted.
	consulted := []string{}
	c.env = func(k string) string {
		consulted = append(consulted, k)
		if k == "BANZAMI_BUILD_COMMIT" {
			return "5c6b2ac6b405"
		}
		return "s3cr3t-" + k
	}
	rows, _ := c.Collect(context.Background())

	for _, k := range consulted {
		if k != "BANZAMI_BUILD_COMMIT" {
			t.Errorf("provenance read the environment variable %q", k)
		}
	}
	body, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	blob := strings.ToLower(string(body))
	for _, forbidden := range []string{
		"s3cr3t", "password", "secret://", "/run/secrets/", "bearer", "token",
		"cookie", "api_key", "apikey", "totp", "pin", "postgres://", "postgresql://",
	} {
		if strings.Contains(blob, forbidden) {
			t.Errorf("serialised provenance contains %q", forbidden)
		}
	}
}

// The environment variable the collector reads is the one the Dockerfile sets
// and the build pipeline supplies. If that chain breaks, provenance silently
// becomes unavailable — so the chain is asserted, not assumed.
func TestProvenance_TheBuildRevisionChainIsWired(t *testing.T) {
	df, err := os.ReadFile("../../Dockerfile")
	if err != nil {
		t.Fatalf("read admin-api Dockerfile: %v", err)
	}
	s := string(df)
	if !strings.Contains(s, "ARG BUILD_COMMIT") {
		t.Error("the admin-api Dockerfile declares no ARG BUILD_COMMIT; the build arg would be discarded")
	}
	if !strings.Contains(s, "ENV BANZAMI_BUILD_COMMIT=$BUILD_COMMIT") {
		t.Error("the admin-api Dockerfile does not expose BANZAMI_BUILD_COMMIT at runtime")
	}
}
