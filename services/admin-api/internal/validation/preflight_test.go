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
	// Both files: the preflight and the provenance it collects. Splitting the
	// collector into its own file must not split the guarantee.
	for _, file := range []string{"preflight.go", "provenance.go"} {
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		code := stripComments(string(src))

		// SQL that writes.
		for _, verb := range []string{"INSERT ", "UPDATE ", "DELETE ", "TRUNCATE ", "ALTER ", "DROP "} {
			if strings.Contains(strings.ToUpper(code), verb) {
				t.Errorf("%s contains %q — a preflight that writes is not a preflight", file, strings.TrimSpace(verb))
			}
		}

		// Anything that would spend a metered budget or act as somebody.
		for _, forbidden := range []string{"Exec(", "SendMail", "Sender", "Login(", "Authenticate", "Authorization"} {
			if strings.Contains(code, forbidden) {
				t.Errorf("%s references %q — it must neither write nor authenticate", file, forbidden)
			}
		}

		// Every database call must be a read.
		for _, c := range regexp.MustCompile(`(?:p|c)\.pool\.\w+\(`).FindAllString(code, -1) {
			if !strings.Contains(c, ".pool.Query") {
				t.Errorf("%s calls %s; only Query/QueryRow are reads", file, c)
			}
		}

		// HTTP is permitted, but ONLY as a GET to a /health endpoint. Reading a
		// service's own statement of what it is costs nothing; anything else
		// reachable over HTTP could submit, send or spend.
		for _, m := range regexp.MustCompile(`http\.Method\w+`).FindAllString(code, -1) {
			if m != "http.MethodGet" {
				t.Errorf("%s uses %s; a preflight may only GET", file, m)
			}
		}
		if strings.Contains(code, "http.NewRequest") && !strings.Contains(code, `"/health"`) {
			t.Errorf("%s makes an HTTP request to something other than /health", file)
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

// A Studio with no database can measure nothing and attribute nothing, so it is
// UNHEALTHY — not DEGRADED. Before provenance was mandatory this was DEGRADED,
// which was too generous: a run prepared then would have been unattributable.
func TestPreflight_WithoutADatabaseIsUnhealthy(t *testing.T) {
	p := NewPreflighter(nil, MustLoad(), nil)
	res, err := p.Run(t.Context(), "GOLDEN")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.Verdict != VerdictUnhealthy {
		t.Errorf("verdict %s; a Studio that can attribute nothing is UNHEALTHY", res.Verdict)
	}
	// No profile may start into an UNHEALTHY lab — not even FULL, which
	// tolerates DEGRADED.
	for _, minimum := range []string{VerdictHealthy, VerdictDegraded} {
		if MeetsMinimum(res.Verdict, minimum) {
			t.Errorf("a run requiring %s would have been cleared to start", minimum)
		}
	}
	// And it says WHY, per mandatory component, rather than failing opaquely.
	named := 0
	for _, c := range res.Checks {
		if c.Group == "provenance" && c.Status == StatusFail {
			named++
		}
	}
	if named != len(MandatoryComponents()) {
		t.Errorf("%d provenance failures reported, want one per mandatory component (%d)",
			named, len(MandatoryComponents()))
	}
}

func TestPreflight_UnknownProfileIsAnError(t *testing.T) {
	p := NewPreflighter(nil, MustLoad(), nil)
	if _, err := p.Run(t.Context(), "NOT_A_PROFILE"); err == nil {
		t.Error("an unknown profile should be an error, not a verdict")
	}
}

// `measured` cannot become a secret sink, and the reason is structural rather
// than a filter someone has to remember to apply: the type is
// map[string]int64. A password, PIN, seed, cookie, token or secret:// URI
// cannot be assigned to it — the compiler refuses before any redactor would.
//
// This test guards that decision, because widening it to map[string]any or
// map[string]string is a one-word change that would silently open the sink.
func TestPreflight_MeasuredCannotCarryASecret(t *testing.T) {
	src, err := os.ReadFile("preflight.go")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`Measured\s+map\[string\]int64`).Match(src) {
		t.Error("Measured is no longer map[string]int64; it can now hold text, " +
			"and text is where a credential would arrive")
	}

	// Detail is free text, so it must never be built from anything secret-shaped.
	code := stripComments(string(src))
	for _, forbidden := range []string{
		"secret://", "/run/secrets/", "Password", "Pin", "TotpSeed", "RecoveryCode",
		"Cookie", "Bearer", "APIKey", "ApiKey", "SessionToken",
	} {
		if strings.Contains(code, forbidden) {
			t.Errorf("the preflight references %q; a check detail could reach the database with it", forbidden)
		}
	}

	// And the same for what actually gets persisted: an actor's credential
	// NAMES may be known, never a value.
	reg := MustLoad()
	for _, a := range reg.Actors {
		for _, n := range a.CredentialNames {
			if strings.Contains(n, "://") || len(n) > 32 {
				t.Errorf("actor %s credential name %q looks like a value, not a name", a.ID, n)
			}
		}
	}
}

// AGGREGATE FUNDS is its own check, never folded into the volume group.
//
// The two measure different things — money MOVED versus money HELD — and a run
// that fits the rolling windows comfortably can still be refused by the cap. An
// operator shown one combined number cannot tell which of them is about to stop
// the run, which is precisely the situation that produced an INSUFFICIENT_FUNDS
// that looked like a product fault.
func TestPreflight_AggregateFundsIsItsOwnBudgetCheck(t *testing.T) {
	if AggregateFundsCapMinor != 50_000_000 {
		t.Errorf("the shared funded-value cap changed to %d; the preflight and the executor "+
			"must move together", AggregateFundsCapMinor)
	}
	// The query must read HELD value across BOTH wallet families. Counting only
	// merchant wallets would miss the synthetic consumers that actually
	// exhausted the cap.
	for _, want := range []string{"available_account_id FROM wallets", "consumer_wallets", "SUM("} {
		if !strings.Contains(QueryAggregateFunds, want) {
			t.Errorf("QueryAggregateFunds no longer contains %q — it would stop measuring "+
				"the thing that ran out", want)
		}
	}
	if strings.Contains(strings.ToUpper(QueryAggregateFunds), "UPDATE") ||
		strings.Contains(strings.ToUpper(QueryAggregateFunds), "INSERT") {
		t.Error("the aggregate-funds measurement must be read-only")
	}
}
