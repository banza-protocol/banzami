package validation

import (
	"encoding/json"
	"strings"
	"testing"
)

// 23 of 24 suites have no journey, so a nil slice is the COMMON case. Encoded
// as `null` it crashes every consumer that counts it; `[]` is the honest
// encoding of "declared, nothing executable".
func TestCatalogue_ASuiteWithNoJourneysSerialisesAsAnEmptyList(t *testing.T) {
	cat, err := MustLoad().Catalogue()
	if err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(cat)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), `"journeys":null`) {
		t.Error("a suite serialised its journeys as null; a consumer counting them would crash")
	}

	empty := 0
	for _, s := range cat {
		if s.Journeys == nil {
			t.Errorf("%s has a nil journey slice", s.ID)
		}
		if len(s.Journeys) == 0 {
			empty++
			if s.Status != StatusDeclared {
				t.Errorf("%s has no journeys but is %s, not DECLARED", s.ID, s.Status)
			}
		}
	}
	if empty == 0 {
		t.Error("no suite is empty; this test would pass vacuously")
	}
}

// The honesty number the whole surface is built around.
func TestCatalogue_CoverageIsDerivedNotAsserted(t *testing.T) {
	r := MustLoad()
	cov, err := r.Coverage()
	if err != nil {
		t.Fatal(err)
	}
	if cov.Suites != len(r.Suites) {
		t.Errorf("coverage counts %d suites, the registry has %d", cov.Suites, len(r.Suites))
	}
	if cov.SuitesDeclared+cov.SuitesWithJourneys != cov.Suites {
		t.Error("declared and with-journeys do not account for every suite")
	}
	// Nothing has ever executed, so nothing may claim to be runtime-proven.
	if cov.JourneysRuntimeProven != 0 {
		t.Errorf("%d journeys claim RUNTIME_PROVEN, but no run has ever executed", cov.JourneysRuntimeProven)
	}
}

// Before a run observes an assertion it is EXPECTED. Never PASS.
func TestCatalogue_NoAssertionClaimsAResultBeforeObservation(t *testing.T) {
	js, err := MustLoad().Journeys()
	if err != nil {
		t.Fatal(err)
	}
	if len(js) == 0 {
		t.Fatal("no journeys; this test would pass vacuously")
	}
	seen := 0
	for _, j := range js {
		for _, a := range j.Assertions {
			seen++
			if a.Result != "EXPECTED" {
				t.Errorf("%s reports %s before any run observed it", a.ID, a.Result)
			}
		}
	}
	if seen == 0 {
		t.Error("no assertions at all; this test would pass vacuously")
	}
}

// The catalogue is a description, not a credential store.
func TestCatalogue_CarriesNoSecret(t *testing.T) {
	cat, _ := MustLoad().Catalogue()
	inv, issues, _ := MustLoad().Assurance()
	body, _ := json.Marshal(map[string]any{"c": cat, "i": inv, "k": issues})
	blob := strings.ToLower(string(body))
	for _, forbidden := range []string{"secret://", "/run/secrets/", "postgres://", "postgresql://", "bearer "} {
		if strings.Contains(blob, forbidden) {
			t.Errorf("the catalogue contains %q", forbidden)
		}
	}
}
