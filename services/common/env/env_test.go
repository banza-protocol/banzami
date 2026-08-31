package env

import "testing"

// The canonical matrix (RA-055). Every row states the expected behaviour
// explicitly, including the security-sensitive consequences, so a future change
// to Parse cannot quietly widen what a value grants.
func TestParseMatrix(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		want    Environment
		sandbox bool
		live    bool
		known   bool
	}{
		// Both casings are accepted deliberately: both are already deployed.
		{"lowercase sandbox", "sandbox", Sandbox, true, false, true},
		{"uppercase SANDBOX", "SANDBOX", Sandbox, true, false, true},
		{"mixed SandBox", "SandBox", Sandbox, true, false, true},
		{"lowercase live", "live", Live, false, true, true},
		{"uppercase LIVE", "LIVE", Live, false, true, true},
		{"surrounding whitespace", "  sandbox  ", Sandbox, true, false, true},
		{"tab and newline", "\tLIVE\n", Live, false, true, true},

		// Everything below grants nothing.
		{"empty", "", Unknown, false, false, false},
		{"whitespace only", "   ", Unknown, false, false, false},
		{"unknown word", "staging", Unknown, false, false, false},
		{"malformed", "sand box", Unknown, false, false, false},
		{"near miss", "sandboxx", Unknown, false, false, false},
		{"prefix only", "sand", Unknown, false, false, false},

		// A different vocabulary must NOT be silently reinterpreted. Treating
		// "production" as Live is the inference this package exists to remove.
		{"production is not live", "production", Unknown, false, false, false},
		{"development is not sandbox", "development", Unknown, false, false, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Parse(c.raw)
			if got != c.want {
				t.Fatalf("Parse(%q) = %v, want %v", c.raw, got, c.want)
			}
			if got.IsSandbox() != c.sandbox {
				t.Errorf("IsSandbox() = %v, want %v", got.IsSandbox(), c.sandbox)
			}
			if got.IsLive() != c.live {
				t.Errorf("IsLive() = %v, want %v", got.IsLive(), c.live)
			}
			if got.IsKnown() != c.known {
				t.Errorf("IsKnown() = %v, want %v", got.IsKnown(), c.known)
			}
		})
	}
}

// The zero value is what an unpopulated struct field holds. It must fail closed.
func TestZeroValueGrantsNothing(t *testing.T) {
	var e Environment
	if e != Unknown || e.IsSandbox() || e.IsLive() || e.IsKnown() {
		t.Fatalf("zero value must be Unknown and grant nothing, got %v", e)
	}
}

// Unknown must never be usable as either environment — this is the property the
// two RA-051 defects violated in opposite directions.
func TestUnknownIsNeitherSandboxNorLive(t *testing.T) {
	for _, raw := range []string{"", "   ", "staging", "prod", "SANDB0X", "l1ve"} {
		e := Parse(raw)
		if e.IsSandbox() {
			t.Errorf("Parse(%q) must not enable Sandbox privileges", raw)
		}
		if e.IsLive() {
			t.Errorf("Parse(%q) must not report Live", raw)
		}
	}
}

// RA-051 regression, stated as the defect itself: the deployed Sandbox sets
// "sandbox", and a gate written against "SANDBOX" silently withheld the feature.
// Both spellings must reach the same decision.
func TestRA051_CasingDoesNotChangeBehaviour(t *testing.T) {
	if Parse("sandbox") != Parse("SANDBOX") {
		t.Fatal("RA-051: 'sandbox' and 'SANDBOX' must be the same environment")
	}
	if !Parse("sandbox").IsSandbox() {
		t.Fatal("RA-051: the deployed lowercase value must enable Sandbox features")
	}
	if Parse("live") != Parse("LIVE") {
		t.Fatal("'live' and 'LIVE' must be the same environment")
	}
}

// A component must not read the same value differently from another — the
// contradiction RA-051 demonstrated.
func TestNoContradictoryInterpretation(t *testing.T) {
	for _, raw := range []string{"sandbox", "SANDBOX", "live", "LIVE", "", "staging"} {
		a, b := Parse(raw), Parse(raw)
		if a != b || a.IsSandbox() != b.IsSandbox() || a.IsLive() != b.IsLive() {
			t.Fatalf("Parse(%q) is not deterministic across callers", raw)
		}
	}
}

func TestStringIsCanonicalWireValue(t *testing.T) {
	if Parse("sandbox").String() != SandboxName {
		t.Errorf("Sandbox must render as %q", SandboxName)
	}
	if Parse("live").String() != LiveName {
		t.Errorf("Live must render as %q", LiveName)
	}
	if Parse("nonsense").String() != "UNKNOWN" {
		t.Error("Unknown must render as UNKNOWN, never as a real environment")
	}
}
