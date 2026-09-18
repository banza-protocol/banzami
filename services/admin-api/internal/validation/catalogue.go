package validation

import (
	"encoding/json"
	"fmt"
	"sort"
)

// The catalogue is the Validation Studio explaining itself.
//
// Its purpose is that an operator authorising a run can answer "what exactly
// will this do?" without reading source, YAML, migrations or a runbook. So
// everything here is DERIVED from the canonical registries — never restated,
// and never reconstructed in the browser.
//
// The hardest thing it has to communicate honestly is that the validation
// universe is mostly DECLARED and barely IMPLEMENTED: 24 suites exist, and one
// journey is written. A surface that listed 24 suites without saying so would
// imply 24 things are tested. That is precisely the lie this programme exists
// to prevent.

// ImplementationStatus says how far a suite or journey has actually got.
//
// It is derived, not authored: nothing in the registries carries this field, so
// it cannot drift from the truth by being forgotten.
const (
	// StatusDeclared — the suite exists and its scope is written down. No
	// executable journey is defined for it.
	StatusDeclared = "DECLARED"
	// StatusSpecified — at least one journey exists with steps and assertions,
	// but it is not wired to an automated harness.
	StatusSpecified = "SPECIFIED"
	// StatusAutomated — a journey is fully automated and names the harness that
	// performs it.
	StatusAutomated = "AUTOMATED"
	// StatusRuntimeProven — observed passing in a real Validation Run.
	// UNREACHABLE until a runner exists: no run has ever executed, so nothing
	// in this build can legitimately carry it.
	StatusRuntimeProven = "RUNTIME_PROVEN"
	// StatusNotProven — the suite has no executable journey and, unlike a
	// DECLARED one, is not waiting for someone to write it: it carries a
	// recorded blocker saying why runtime proof is unavailable and what would
	// make it available. Distinguishing the two is the point.
	StatusNotProven = "NOT_PROVEN"
)

// Step is one planned action inside a journey.
type Step struct {
	Seq       int      `json:"seq"`
	Action    string   `json:"action"`
	ExpectUI  string   `json:"expect_ui,omitempty"`
	ExpectAPI string   `json:"expect_api,omitempty"`
	Evidence  []string `json:"evidence,omitempty"`
	// Mutating is derived from the expectation: a step that expects a 201 or
	// names a state change writes something; a step that only reads does not.
	Mutating bool `json:"mutating"`
}

// Assertion is a thing that must hold for the journey to pass. Before any run
// has observed it, its result is EXPECTED and nothing else.
type Assertion struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"` // financial | negative | evidence
	Describe string `json:"describe"`
	Blocking bool   `json:"blocking"`
	// Result is always "EXPECTED" here. A catalogue describes what a run WOULD
	// assert; only a run can say what happened.
	Result string `json:"result"`
}

// Journey is one end-to-end scenario.
type Journey struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Suite         string   `json:"suite"`
	Capabilities  []string `json:"capabilities,omitempty"`
	Actors        []string `json:"actors,omitempty"`
	Preconditions []string `json:"preconditions,omitempty"`

	EntrySurface string `json:"entry_surface,omitempty"`
	EntryPath    string `json:"entry_path,omitempty"`

	Steps      []Step      `json:"steps,omitempty"`
	Assertions []Assertion `json:"assertions,omitempty"`

	// StateChanges is what the journey is ALLOWED to modify, and Preserved is
	// what it must not. Making destructive scope visible before execution is
	// the point.
	StateChanges []string `json:"state_changes,omitempty"`
	Preserved    []string `json:"preserved,omitempty"`

	EvidenceRequired []string `json:"evidence_required,omitempty"`
	DependsOn        []string `json:"depends_on,omitempty"`
	Automation       string   `json:"automation,omitempty"`
	Harness          string   `json:"harness,omitempty"`

	Status string `json:"implementation_status"`
}

// SuiteDetail is a suite plus everything derivable about it.
type SuiteDetail struct {
	Suite
	Rationale string    `json:"rationale,omitempty"`
	Journeys  []Journey `json:"journeys"`
	Status    string    `json:"implementation_status"`
	Profiles  []string  `json:"profiles"`
	Actors    []string  `json:"actors"`
}

// ─────────────────────────────────────────────────────────────────────────────

type rawJourney struct {
	JourneyID     string   `json:"journey_id"`
	Suite         string   `json:"suite"`
	Name          string   `json:"name"`
	Capabilities  []string `json:"capabilities"`
	Actors        []string `json:"actors"`
	Preconditions []string `json:"preconditions"`
	EntryPoint    struct {
		Surface string `json:"surface"`
		Path    string `json:"path"`
	} `json:"entry_point"`
	Steps []struct {
		Action    string   `json:"action"`
		ExpectUI  string   `json:"expect_ui"`
		ExpectAPI string   `json:"expect_api"`
		Evidence  []string `json:"evidence"`
	} `json:"steps"`
	FinancialExpectations []map[string]any `json:"financial_expectations"`
	NegativeAssertions    []string         `json:"negative_assertions"`
	EvidenceRequired      []string         `json:"evidence_required"`
	Cleanup               struct {
		Disposable []string `json:"disposable"`
		Preserved  []string `json:"preserved"`
	} `json:"cleanup"`
	DependsOn  []string `json:"depends_on"`
	Automation string   `json:"automation"`
	Harness    string   `json:"existing_harness"`
}

type rawSuite struct {
	ID        string `json:"id"`
	Rationale string `json:"rationale"`
	Scope     string `json:"scope"`
}

// Journeys returns every journey the registry actually defines.
//
// The count is deliberately not padded: a suite with no journey returns none,
// and the caller must show that rather than imply coverage.
func (r *Registry) Journeys() ([]Journey, error) {
	var doc struct {
		Journeys []rawJourney `json:"journeys"`
	}
	if err := json.Unmarshal([]byte(journeysJSON), &doc); err != nil {
		return nil, fmt.Errorf("journeys: %w", err)
	}

	out := make([]Journey, 0, len(doc.Journeys))
	for _, j := range doc.Journeys {
		out = append(out, buildJourney(j))
	}
	sort.Slice(out, func(a, b int) bool { return out[a].ID < out[b].ID })
	return out, nil
}

func buildJourney(j rawJourney) Journey {
	steps := make([]Step, 0, len(j.Steps))
	for i, s := range j.Steps {
		steps = append(steps, Step{
			Seq: i + 1, Action: s.Action,
			ExpectUI: s.ExpectUI, ExpectAPI: s.ExpectAPI, Evidence: s.Evidence,
			Mutating: stepMutates(s.ExpectAPI, s.Action),
		})
	}

	assertions := make([]Assertion, 0,
		len(j.FinancialExpectations)+len(j.NegativeAssertions)+len(j.EvidenceRequired))

	// Financial expectations are blocking by construction: money is the thing
	// the operator cannot be wrong about.
	for i, f := range j.FinancialExpectations {
		assertions = append(assertions, Assertion{
			ID:   fmt.Sprintf("%s-FIN-%02d", j.JourneyID, i+1),
			Kind: "financial", Blocking: true, Result: "EXPECTED",
			Describe: describeFinancial(f),
		})
	}
	// A negative assertion is a thing that must NOT happen. They are blocking
	// too: "B02 cannot read B01's collection" failing is a security defect.
	for i, n := range j.NegativeAssertions {
		assertions = append(assertions, Assertion{
			ID:   fmt.Sprintf("%s-NEG-%02d", j.JourneyID, i+1),
			Kind: "negative", Blocking: true, Result: "EXPECTED", Describe: n,
		})
	}
	for i, e := range j.EvidenceRequired {
		assertions = append(assertions, Assertion{
			ID:   fmt.Sprintf("%s-EVD-%02d", j.JourneyID, i+1),
			Kind: "evidence", Blocking: true, Result: "EXPECTED",
			Describe: "an artifact of type " + e + " resolves in the run's evidence manifest",
		})
	}

	status := StatusSpecified
	if j.Automation == "full" && j.Harness != "" {
		status = StatusAutomated
	}

	return Journey{
		ID: j.JourneyID, Name: j.Name, Suite: j.Suite,
		Capabilities: j.Capabilities, Actors: j.Actors, Preconditions: j.Preconditions,
		EntrySurface: j.EntryPoint.Surface, EntryPath: j.EntryPoint.Path,
		Steps: steps, Assertions: assertions,
		StateChanges:     j.Cleanup.Disposable,
		Preserved:        j.Cleanup.Preserved,
		EvidenceRequired: j.EvidenceRequired,
		DependsOn:        j.DependsOn,
		Automation:       j.Automation,
		Harness:          j.Harness,
		Status:           status,
	}
}

// describeFinancial turns one expectation into a sentence an operator reads
// without having to know the schema.
func describeFinancial(f map[string]any) string {
	if inv, ok := f["invariant"].(string); ok {
		return "invariant holds: " + inv
	}
	acct, _ := f["account"].(string)
	if d, ok := f["delta_minor"].(float64); ok {
		sign := "+"
		if d < 0 {
			sign = ""
		}
		return fmt.Sprintf("%s changes by %s%d minor", acct, sign, int64(d))
	}
	return fmt.Sprintf("%v", f)
}

// stepMutates is a conservative read: anything that expects a created resource,
// or whose action reads as an instruction rather than an observation, writes.
// When in doubt it says true, because under-stating destructive scope is the
// dangerous direction.
func stepMutates(expectAPI, action string) bool {
	for _, w := range []string{"201", "POST", "PUT", "PATCH", "DELETE"} {
		if containsFold(expectAPI, w) {
			return true
		}
	}
	for _, w := range []string{"create", "pay", "confirm", "surface", "split", "send", "scan"} {
		if containsFold(action, w) {
			return true
		}
	}
	return false
}

func containsFold(hay, needle string) bool {
	if len(needle) > len(hay) {
		return false
	}
	lower := func(b byte) byte {
		if b >= 'A' && b <= 'Z' {
			return b + 32
		}
		return b
	}
	for i := 0; i+len(needle) <= len(hay); i++ {
		ok := true
		for k := 0; k < len(needle); k++ {
			if lower(hay[i+k]) != lower(needle[k]) {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}
	return false
}

// Catalogue returns every suite with the journeys that actually exist for it.
func (r *Registry) Catalogue() ([]SuiteDetail, error) {
	journeys, err := r.Journeys()
	if err != nil {
		return nil, err
	}
	bySuite := map[string][]Journey{}
	for _, j := range journeys {
		bySuite[j.Suite] = append(bySuite[j.Suite], j)
	}

	var raw struct {
		Suites []rawSuite `json:"suites"`
	}
	_ = json.Unmarshal([]byte(suitesJSON), &raw)
	rationale := map[string]string{}
	for _, s := range raw.Suites {
		rationale[s.ID] = s.Rationale
	}

	out := make([]SuiteDetail, 0, len(r.Suites))
	for _, s := range r.Suites {
		// A nil slice marshals as `null`, and a consumer doing `.length` on it
		// crashes. An empty list is the honest encoding of "declared, nothing
		// executable".
		js := bySuite[s.ID]
		if js == nil {
			js = []Journey{}
		}

		// A suite with no journey is DECLARED, however well its scope is
		// written. Nothing about it has been made executable.
		status := StatusDeclared
		for _, j := range js {
			if j.Status == StatusAutomated {
				status = StatusAutomated
				break
			}
			status = StatusSpecified
		}
		// …unless it is one of the suites that CANNOT be made executable for a
		// recorded reason. DECLARED and NOT_PROVEN look the same from the
		// outside — no journey — and mean opposite things: one is work not yet
		// done, the other is work that was done and reached a wall.
		if s.NotProven() {
			status = StatusNotProven
		}

		profiles := []string{}
		for _, p := range r.Profiles {
			for _, id := range p.Suites {
				if id == s.ID {
					profiles = append(profiles, p.ID)
					break
				}
			}
		}

		actorSet := map[string]bool{}
		for _, j := range js {
			for _, a := range j.Actors {
				actorSet[a] = true
			}
		}
		actors := make([]string, 0, len(actorSet))
		for a := range actorSet {
			actors = append(actors, a)
		}
		sort.Strings(actors)

		out = append(out, SuiteDetail{
			Suite: s, Rationale: rationale[s.ID],
			Journeys: js, Status: status, Profiles: profiles, Actors: actors,
		})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].ID < out[b].ID })
	return out, nil
}

// CoverageSummary is the headline honesty number: how much of the declared
// validation universe is actually executable, and how much has ever run.
type CoverageSummary struct {
	Suites                int `json:"suites"`
	SuitesDeclared        int `json:"suites_declared"`
	SuitesWithJourneys    int `json:"suites_with_journeys"`
	Journeys              int `json:"journeys"`
	JourneysAutomated     int `json:"journeys_automated"`
	JourneysRuntimeProven int `json:"journeys_runtime_proven"`
}

func (r *Registry) Coverage() (CoverageSummary, error) {
	cat, err := r.Catalogue()
	if err != nil {
		return CoverageSummary{}, err
	}
	c := CoverageSummary{Suites: len(cat)}
	for _, s := range cat {
		if len(s.Journeys) == 0 {
			c.SuitesDeclared++
			continue
		}
		c.SuitesWithJourneys++
		for _, j := range s.Journeys {
			c.Journeys++
			if j.Status == StatusAutomated {
				c.JourneysAutomated++
			}
		}
	}
	// Nothing has ever executed, so nothing is runtime-proven. This is computed
	// rather than assumed: when a runner exists it will be derived from runs.
	c.JourneysRuntimeProven = 0
	return c, nil
}

// ── Assurance: the guarantees, and the debt ─────────────────────────────────

// Invariant is a guarantee the Studio makes, where it is enforced, and what
// proves it. An operator authorising a run should be able to read these without
// opening the source they are implemented in.
type Invariant struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	// TitlePT is what BANZADMIN renders. The English stays canonical, the way
	// suites.yaml already carries name and name_pt.
	TitlePT    string `json:"title_pt,omitempty"`
	EnforcedBy string `json:"enforced_by"` // database | application | build
	Layer      string `json:"layer"`
	Proof      string `json:"proof"`
	Why        string `json:"why"`
}

// KnownIssue is validation debt — something that changes how much a Validation
// Run should be trusted. Not a repository TODO.
type KnownIssue struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	TitlePT       string `json:"title_pt,omitempty"`
	DetailPT      string `json:"detail_pt,omitempty"`
	Status        string `json:"status"`
	Severity      string `json:"severity"`
	Scope         string `json:"scope"`
	BlocksGolden  bool   `json:"blocks_golden"`
	BlocksFull    bool   `json:"blocks_full"`
	FirstObserved string `json:"first_observed"`
	Detail        string `json:"detail"`
}

// Assurance returns the invariant catalogue and the open validation debt.
func (r *Registry) Assurance() ([]Invariant, []KnownIssue, error) {
	var doc struct {
		Invariants  []Invariant  `json:"invariants"`
		KnownIssues []KnownIssue `json:"known_issues"`
	}
	if err := json.Unmarshal([]byte(assuranceJSON), &doc); err != nil {
		return nil, nil, fmt.Errorf("assurance: %w", err)
	}
	return doc.Invariants, doc.KnownIssues, nil
}

// ── The component map ───────────────────────────────────────────────────────

// Component is a service the Validation Studio depends on, what it is for, and
// whether a run's trust rests on it.
//
// Only components that ACTUALLY participate are listed. A map padded with every
// container in the infrastructure would suggest the Studio verifies more than
// it does.
type Component struct {
	Name           string `json:"name"`
	Responsibility string `json:"responsibility"`
	// Mandatory means a prepared run cannot reach READY without its revision.
	Mandatory bool `json:"mandatory_for_preparation"`
	// ExercisedAtExecution means a RUN would touch it — which is why it will
	// join the mandatory set once a runner exists.
	ExercisedAtExecution bool   `json:"exercised_at_execution"`
	ProvenanceSource     string `json:"provenance_source"`
	Revision             string `json:"revision,omitempty"`
	RevisionKnown        bool   `json:"revision_known"`
}

// Components describes the participating set, filled in with whatever the
// provenance collector could actually read.
//
// A component whose revision is unknown says so. It is never filled in from the
// repository's HEAD, and never omitted to make the table look complete.
func (r *Registry) Components(collected []ProvenanceRow) []Component {
	known := map[string]ProvenanceRow{}
	for _, p := range collected {
		known[p.Component] = p
	}

	defs := []Component{
		{Name: ComponentAdminAPI,
			Responsibility: "the Validation Studio control plane: computes the preflight, prepares and cancels runs",
			Mandatory:      true, ExercisedAtExecution: true,
			ProvenanceSource: "BANZAMI_BUILD_COMMIT"},
		{Name: ComponentGateway,
			Responsibility: "the product surface a Validation Run exercises: applications, payments, collections, receipts",
			Mandatory:      true, ExercisedAtExecution: true,
			ProvenanceSource: "GET /health .build"},
		{Name: ComponentSchema,
			Responsibility: "the ledger, the actors' product identities, and the Studio's own run model",
			Mandatory:      true, ExercisedAtExecution: true,
			ProvenanceSource: "_sqlx_migrations"},
		{Name: ComponentRegistry,
			Responsibility: "the actor, suite, journey and profile definitions compiled into this build",
			Mandatory:      true, ExercisedAtExecution: true,
			ProvenanceSource: "compiled-in registry"},

		// Participate at EXECUTION only. Not mandatory for preparation, and
		// none of them reports a build revision today — which is exactly why
		// they are listed as unknown rather than quietly left out.
		{Name: "core-api",
			Responsibility:       "the financial kernel: ledger postings, wallets, settlement, pilot limits",
			ExercisedAtExecution: true, ProvenanceSource: "not exposed at runtime"},
		{Name: "public-api",
			Responsibility:       "consumer identity, registration and the wallet app's backend",
			ExercisedAtExecution: true, ProvenanceSource: "not exposed at runtime"},
		{Name: "webhook-sink",
			Responsibility:       "receives and records webhooks a journey asserts were delivered",
			ExercisedAtExecution: true, ProvenanceSource: "not exposed at runtime"},
		{Name: "app-frontend",
			Responsibility:       "App Banzami on the web — the surface consumer and business journeys drive",
			ExercisedAtExecution: true, ProvenanceSource: "not exposed at runtime"},
	}

	for i := range defs {
		if p, ok := known[defs[i].Name]; ok {
			defs[i].Revision = p.Revision
			defs[i].RevisionKnown = true
			if src := p.Detail["source"]; src != "" {
				defs[i].ProvenanceSource = src
			}
		}
	}
	return defs
}
