package validation

import (
	"encoding/json"
	"strings"
	"testing"
)

// The Studio's central security property: nothing it serves can identify, let
// alone reveal, a credential. An operator needs to know that A01 HAS a TOTP
// seed registered; knowing where that seed lives is a service nobody needs and
// a hint an attacker would take.
func TestActor_NeverCarriesACredentialValue(t *testing.T) {
	reg := MustLoad()

	body, err := json.Marshal(reg.Actors)
	if err != nil {
		t.Fatalf("marshal actors: %v", err)
	}
	serialised := string(body)

	// What must never appear is a credential VALUE or the LOCATION of one.
	// The word "pin" may legitimately appear as a credential NAME, so the
	// shapes below are the ones that carry something more than a name.
	for _, forbidden := range []string{
		"secret://",     // the reference itself
		"/run/secrets/", // where it resolves
		"banzami/validation/",
	} {
		if strings.Contains(strings.ToLower(serialised), strings.ToLower(forbidden)) {
			t.Errorf("a serialised actor contains %q", forbidden)
		}
	}

	a01, ok := reg.Actor("A01")
	if !ok {
		t.Fatal("A01 is not in the registry")
	}
	if len(a01.CredentialNames) == 0 {
		t.Error("A01 should report WHICH credentials it holds")
	}
	for _, name := range a01.CredentialNames {
		if strings.Contains(name, ":") || strings.Contains(name, "/") {
			t.Errorf("credential name %q looks like a reference, not a name", name)
		}
	}
}

func TestRegistry_HoldsTheNineProvisionedActors(t *testing.T) {
	reg := MustLoad()
	if len(reg.Actors) != 9 {
		t.Fatalf("expected the nine Validation Actors, got %d", len(reg.Actors))
	}
	for _, a := range reg.Actors {
		if a.Status != "provisioned" {
			t.Errorf("%s is %s; Phase C ground truth says all nine are provisioned", a.ID, a.Status)
		}
	}
}

// A profile must never be able to make a failing invariant stop counting.
func TestProfile_CannotDropABlockingSuite(t *testing.T) {
	reg := MustLoad()
	for _, p := range reg.Profiles {
		blocking := reg.BlockingSuites(p)
		for _, s := range reg.Suites {
			if !s.Blocking {
				continue
			}
			inProfile := false
			for _, id := range p.Suites {
				if id == s.ID {
					inProfile = true
				}
			}
			if !inProfile {
				t.Errorf("profile %s omits blocking suite %s", p.ID, s.ID)
				continue
			}
			found := false
			for _, id := range blocking {
				if id == s.ID {
					found = true
				}
			}
			if !found {
				t.Errorf("profile %s includes blocking suite %s but does not treat it as blocking", p.ID, s.ID)
			}
		}
	}
}

func TestProfile_GoldenIsTheStrictOne(t *testing.T) {
	reg := MustLoad()
	g, ok := reg.Profile("GOLDEN")
	if !ok {
		t.Fatal("GOLDEN is not defined")
	}
	if g.Retry.MaxPassWithRetry != 0 {
		t.Errorf("GOLDEN permits %d PASS_WITH_RETRY; a Golden Run permits none", g.Retry.MaxPassWithRetry)
	}
	if g.Preflight.MinimumVerdict != "HEALTHY" {
		t.Errorf("GOLDEN starts at %s; it must require HEALTHY", g.Preflight.MinimumVerdict)
	}
	if g.Digest == "" || len(g.Digest) != 64 {
		t.Errorf("GOLDEN has no usable digest (%q); a run could not pin what it ran", g.Digest)
	}

	f, _ := reg.Profile("FULL")
	if f.Digest == g.Digest {
		t.Error("GOLDEN and FULL share a digest; editing one would re-describe the other")
	}
}

// Lower-case, upper-case, whichever the operator typed.
func TestProfile_LookupIsCaseInsensitive(t *testing.T) {
	reg := MustLoad()
	if _, ok := reg.Profile("golden"); !ok {
		t.Error(`Profile("golden") should resolve`)
	}
	if _, ok := reg.Profile("NOT_A_PROFILE"); ok {
		t.Error("an unknown profile resolved")
	}
}
