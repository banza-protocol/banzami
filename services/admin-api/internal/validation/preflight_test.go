package validation

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The preflight's defining property: it can be run as often as an operator
// likes without spending the very budget it is measuring. That is only true if
// it never writes, never authenticates, never sends and never submits.
//
// Proven structurally, against the source itself, because the alternative —
// asserting after the fact that nothing changed — cannot distinguish "wrote
// nothing" from "wrote something that happened to be idempotent".
func TestPreflight_ConsumesNoQuota(t *testing.T) {
	src, err := os.ReadFile("preflight.go")
	if err != nil {
		t.Fatalf("read preflight.go: %v", err)
	}
	code := stripComments(string(src))

	// SQL that writes.
	for _, verb := range []string{"INSERT ", "UPDATE ", "DELETE ", "TRUNCATE ", "ALTER ", "DROP "} {
		if strings.Contains(strings.ToUpper(code), verb) {
			t.Errorf("the preflight contains %q — a preflight that writes is not a preflight", strings.TrimSpace(verb))
		}
	}

	// Anything that would spend a metered budget: an HTTP call could submit an
	// application or trigger an email, both of which are rationed.
	for _, forbidden := range []string{
		"http.", "net/http", "Exec(", "SendMail", "Sender", "Login(", "Authenticate",
	} {
		if strings.Contains(code, forbidden) {
			t.Errorf("the preflight references %q — it must neither call out nor authenticate", forbidden)
		}
	}

	// Every database call must be a read.
	calls := regexp.MustCompile(`p\.pool\.\w+\(`).FindAllString(code, -1)
	if len(calls) == 0 {
		t.Fatal("the preflight makes no database call at all; it cannot be measuring anything")
	}
	for _, c := range calls {
		if !strings.HasPrefix(c, "p.pool.Query") {
			t.Errorf("the preflight calls %s; only Query/QueryRow are reads", c)
		}
	}
}

func stripComments(s string) string {
	out := make([]string, 0, 256)
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimSpace(line); strings.HasPrefix(t, "//") {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

// An infrastructure fault must never be reported as a product defect, so the
// two vocabularies never share a word and the collapse rule is explicit.
func TestPreflight_VerdictIsTheWorstCheck(t *testing.T) {
	cases := []struct {
		name   string
		checks []Check
		want   string
	}{
		{"nothing wrong", []Check{{Status: StatusPass}, {Status: StatusPass}}, VerdictHealthy},
		{"a warning degrades", []Check{{Status: StatusPass}, {Status: StatusWarn}}, VerdictDegraded},
		{"an unmeasurable check degrades", []Check{{Status: StatusUnavailable}}, VerdictDegraded},
		{"a skip is not a problem", []Check{{Status: StatusPass}, {Status: StatusSkipped}}, VerdictHealthy},
		{"one failure is enough", []Check{{Status: StatusPass}, {Status: StatusFail}, {Status: StatusWarn}}, VerdictUnhealthy},
		{"no checks at all", nil, VerdictHealthy},
	}
	for _, tc := range cases {
		if got := verdictOf(tc.checks); got != tc.want {
			t.Errorf("%s: got %s, want %s", tc.name, got, tc.want)
		}
	}
}

// GOLDEN does not start into a DEGRADED lab; FULL may; neither starts into an
// UNHEALTHY one, because an unhealthy lab reports infrastructure faults as
// product defects and that is worse than not running.
func TestPreflight_MinimumVerdictGatesTheProfile(t *testing.T) {
	cases := []struct {
		verdict, minimum string
		want             bool
	}{
		{VerdictHealthy, VerdictHealthy, true},
		{VerdictDegraded, VerdictHealthy, false},
		{VerdictUnhealthy, VerdictHealthy, false},
		{VerdictHealthy, VerdictDegraded, true},
		{VerdictDegraded, VerdictDegraded, true},
		{VerdictUnhealthy, VerdictDegraded, false},
	}
	for _, tc := range cases {
		if got := MeetsMinimum(tc.verdict, tc.minimum); got != tc.want {
			t.Errorf("MeetsMinimum(%s, %s) = %v, want %v", tc.verdict, tc.minimum, got, tc.want)
		}
	}

	reg := MustLoad()
	g, _ := reg.Profile("GOLDEN")
	if MeetsMinimum(VerdictDegraded, g.Preflight.MinimumVerdict) {
		t.Error("a GOLDEN run would start into a DEGRADED lab")
	}
	f, _ := reg.Profile("FULL")
	if !MeetsMinimum(VerdictDegraded, f.Preflight.MinimumVerdict) {
		t.Error("a FULL run should be allowed to start DEGRADED")
	}
	if MeetsMinimum(VerdictUnhealthy, f.Preflight.MinimumVerdict) {
		t.Error("no profile may start into an UNHEALTHY lab")
	}
}

// The limits and the definition of volume come from core/compliance, extracted
// rather than restated. If that coupling ever breaks, this is where it shows.
func TestPreflight_MeasuresWithTheEnginesOwnDefinition(t *testing.T) {
	if GlobalRolling24hMinor <= 0 || MerchantRolling24hMinor <= 0 {
		t.Fatal("the pilot limits did not survive generation")
	}
	if MerchantRolling24hMinor*2 > GlobalRolling24hMinor {
		t.Error("two merchants at their cap would exceed the global window; " +
			"core/compliance/src/pilot.rs asserts otherwise")
	}
	for _, q := range []string{QueryGlobalRollingVolume, QueryMerchantRollingVolume} {
		up := strings.ToUpper(q)
		if !strings.HasPrefix(up, "SELECT") {
			t.Errorf("a volume query is not a SELECT: %q", q)
		}
		if !strings.Contains(up, "'CREDIT'") {
			t.Errorf("a volume query does not filter to credits: %q", q)
		}
	}
}

// A preflight with no pool must say so rather than silently pass.
func TestPreflight_WithoutADatabaseIsNotHealthy(t *testing.T) {
	p := NewPreflighter(nil, MustLoad())
	res, err := p.Run(t.Context(), "GOLDEN")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.Verdict != VerdictDegraded {
		t.Errorf("verdict %s; a preflight that could measure nothing is DEGRADED", res.Verdict)
	}
	if MeetsMinimum(res.Verdict, "HEALTHY") {
		t.Error("a GOLDEN run would have been cleared to start")
	}
}

func TestPreflight_UnknownProfileIsAnError(t *testing.T) {
	p := NewPreflighter(nil, MustLoad())
	if _, err := p.Run(t.Context(), "NOT_A_PROFILE"); err == nil {
		t.Error("an unknown profile should be an error, not a verdict")
	}
}
