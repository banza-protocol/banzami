package server

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// The Validation Studio's permission matrix, read from the route table itself.
//
// The Studio is Sandbox-only and its data is synthetic, but it is not harmless:
// preparing a run reserves the Sandbox's one run slot and names what will be
// spent, and evidence carries real financial detail about the nine actors. So
// every route states its capability, and preparation additionally states
// step-up.
func TestValidation_EveryRouteStatesItsCapability(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}

	for _, r := range []struct {
		method, route, capability string
		stepUp                    bool
	}{
		// Reading the Studio. The preflight is a GET and a read: it writes no
		// row, moves no money, sends no email and authenticates as nobody, so
		// an operator who may read the Studio may ask as often as they like.
		{"Get", `"/admin/v1/validation/overview"`, "CapValidationView", false},
		{"Get", `"/admin/v1/validation/actors"`, "CapValidationView", false},
		{"Get", `"/admin/v1/validation/profiles"`, "CapValidationView", false},
		{"Get", `"/admin/v1/validation/preflight"`, "CapValidationView", false},
		{"Get", `"/admin/v1/validation/runs"`, "CapValidationView", false},
		{"Get", `"/admin/v1/validation/runs/{id}"`, "CapValidationView", false},

		// Preparing a run spends nothing, but it takes the Sandbox's only run
		// slot. A lifted cookie must not be enough.
		{"Post", `"/admin/v1/validation/runs"`, "CapValidationRun", true},

		// Cancelling needs the capability but not step-up: an operator must
		// always be able to stop something, and a second factor standing
		// between a human and the stop button is a worse failure than the one
		// it prevents.
		{"Post", `"/admin/v1/validation/runs/{id}/cancel"`, "CapValidationRun", false},
	} {
		re := regexp.MustCompile(`r\.With\((cap\(auth\.\w+\)(?:, \w+)*)\)\.` + r.method +
			`\(` + regexp.QuoteMeta(r.route) + `,`)
		m := re.FindAllStringSubmatch(string(src), -1)
		if len(m) != 1 {
			t.Fatalf("%s %s: want exactly one route, found %d", r.method, r.route, len(m))
		}
		gate := m[0][1]
		if !strings.Contains(gate, "auth."+r.capability+")") {
			t.Errorf("%s %s is gated by %s, want %s", r.method, r.route, gate, r.capability)
		}
		hasStepUp := regexp.MustCompile(`\bstepUp\b`).MatchString(gate)
		if hasStepUp != r.stepUp {
			t.Errorf("%s %s step-up = %v, want %v (gate: %s)", r.method, r.route, hasStepUp, r.stepUp, gate)
		}
	}
}

// Phase C builds a surface capable of orchestrating a run. It does not start
// one, and there is no route that could.
func TestValidation_NoRouteStartsARun(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"/start", "/queue", "/execute", "/golden", "/full"} {
		if strings.Contains(string(src), `"/admin/v1/validation`+forbidden) {
			t.Errorf("a route exists at /admin/v1/validation%s — Phase C builds the surface, not the starter", forbidden)
		}
	}
}

// Who may see the Studio, and who may take its run slot. Read from the role
// table rather than from the route table, so the two must agree.
func TestValidation_RoleMatrix(t *testing.T) {
	cases := []struct {
		role string
		view bool
		run  bool
		cfg  bool
	}{
		{"SUPER_ADMIN", true, true, true},
		{"OPERATIONS", true, true, false},
		{"COMPLIANCE", true, false, false},
		// SUPPORT sees the Studio. Doc 07 §8 proposed otherwise in Phase A, and
		// the implementation is the better answer: SUPPORT already holds every
		// read capability READ_ONLY holds, so denying this one would make it
		// the only role that can read payouts and disputes but cannot see
		// whether the Sandbox is up — which is exactly the question a help desk
		// is asked. Evidence stays out of reach (CapValidationEvidence).
		{"SUPPORT", true, false, false},
		{"READ_ONLY", true, false, false},
	}
	for _, c := range cases {
		if got := auth.Can(c.role, auth.CapValidationView); got != c.view {
			t.Errorf("%s validation.view = %v, want %v", c.role, got, c.view)
		}
		if got := auth.Can(c.role, auth.CapValidationRun); got != c.run {
			t.Errorf("%s validation.run = %v, want %v", c.role, got, c.run)
		}
		if got := auth.Can(c.role, auth.CapValidationConfig); got != c.cfg {
			t.Errorf("%s validation.config = %v, want %v", c.role, got, c.cfg)
		}
		// Reading the Studio and reading its EVIDENCE are different rights:
		// evidence carries real financial detail about the nine actors.
		if auth.Can(c.role, auth.CapValidationEvidence) && !c.view {
			t.Errorf("%s can open evidence but cannot see the Studio", c.role)
		}
	}

	// Publishing to a public registry is irreversible — npm versions cannot be
	// republished — so it belongs to SUPER_ADMIN alone, like repricing and
	// settlement.
	for _, role := range []string{"OPERATIONS", "COMPLIANCE", "SUPPORT", "READ_ONLY"} {
		if auth.Can(role, auth.CapValidationPublish) {
			t.Errorf("%s holds validation.publish", role)
		}
	}
	if !auth.Can("SUPER_ADMIN", auth.CapValidationPublish) {
		t.Error("SUPER_ADMIN does not hold validation.publish; nobody could authorise a publication")
	}
}
