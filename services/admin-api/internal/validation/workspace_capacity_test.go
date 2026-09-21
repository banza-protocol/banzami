package validation

import (
	"testing"
	"time"
)

// The control plane's half of workspace capacity is the arithmetic and the
// refusal. Both are proven here by watching them say no for the right reason —
// a capacity gate nobody has seen close is not a gate, and BZV-20260921-0001
// was abandoned against a limit that had no gate at all.

func TestReserveFor_UnknownModelIsNotZero(t *testing.T) {
	if n, ok := reserveFor("FULL", 7); !ok || n != WorkspacePermittedRetries["FULL"]*7 {
		t.Fatalf("declared model: got %d ok=%v", n, ok)
	}
	// A model this build does not implement must not quietly reserve nothing.
	saved := WorkspaceReserveModel["FULL"]
	WorkspaceReserveModel["FULL"] = "some_model_from_the_future"
	defer func() { WorkspaceReserveModel["FULL"] = saved }()
	if n, ok := reserveFor("FULL", 7); ok || n != 0 {
		t.Fatalf("unknown model must refuse, got %d ok=%v", n, ok)
	}
	if _, ok := reserveFor("NO_SUCH_PROFILE", 7); ok {
		t.Fatal("a profile with no declared model must refuse")
	}
}

func TestActorCapacity_BoundaryIsExact(t *testing.T) {
	row := WorkspaceActorPlan{Actor: "11111111-2222-4333-8444-555555555555", Kind: "SHARED"}
	// used 6, limit 20, need 7, reserve 7 → required 14, free 14: exactly fits.
	if c := actorCapacity(row, 6, 20, 7, 7, nil); !c.OK || c.Required != 14 || c.Free != 14 {
		t.Fatalf("exact fit must pass: %+v", c)
	}
	// One more already spent and it does not.
	if c := actorCapacity(row, 7, 20, 7, 7, nil); c.OK {
		t.Fatalf("one over must refuse: %+v", c)
	}
}

func TestActorCapacity_ForecastNamesTheNthExpiry(t *testing.T) {
	base := time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)
	creations := []time.Time{base, base.Add(time.Hour), base.Add(2 * time.Hour)}
	// free 0, required 2 → the SECOND slot is the one that makes it fit.
	c := actorCapacity(WorkspaceActorPlan{Kind: "SHARED", Actor: "a"}, 20, 20, 1, 1, creations)
	if c.OK || c.NextUsefulExpiry == nil {
		t.Fatalf("expected a refusal with a forecast: %+v", c)
	}
	want := base.Add(time.Hour).Add(time.Duration(WorkspaceWindowHours) * time.Hour)
	if !c.NextUsefulExpiry.Equal(want) {
		t.Fatalf("forecast %v, want %v — naming the FIRST expiry promises capacity it does not give",
			c.NextUsefulExpiry, want)
	}
}

func TestActorCapacity_NoForecastWhenTheWindowCannotSupplyIt(t *testing.T) {
	base := time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)
	c := actorCapacity(WorkspaceActorPlan{Kind: "SHARED", Actor: "a"}, 20, 20, 9, 9, []time.Time{base})
	if c.OK || c.NextUsefulExpiry != nil {
		t.Fatalf("one ageing slot cannot supply eighteen: %+v", c)
	}
}

func TestFinish_NamesBothHalvesOfTheRequirement(t *testing.T) {
	c := WorkspaceCapacity{Family: FamilyWorkspaceCreation, OK: true, Actors: []WorkspaceActorCapacity{
		{Actor: "11111111-2222-4333-8444-555555555555", Kind: "SHARED",
			Free: 3, Required: 14, Planned: 7, Reserve: 7, OK: false},
	}}
	finish(&c)
	if c.OK || c.Reason != ReasonInsufficient {
		t.Fatalf("must refuse: %+v", c)
	}
	for _, want := range []string{"7 planned", "7 retry", "free 3", "required 14"} {
		if !contains(c.Detail, want) {
			t.Fatalf("detail %q is missing %q — an operator cannot act on a verdict alone", c.Detail, want)
		}
	}
}

func TestUnknownFamilies_RefuseBoth(t *testing.T) {
	fams := unknownFamilies("usage unreadable")
	if len(fams) != 2 {
		t.Fatalf("both families must answer, got %d", len(fams))
	}
	for _, f := range fams {
		if f.OK || f.Reason != ReasonUnknownCapacity {
			t.Fatalf("an unreadable quota is not an empty one: %+v", f)
		}
	}
}

// The two families must never be collapsed: they are freed by different events.
func TestTheTwoFamiliesAreDistinct(t *testing.T) {
	if FamilyWorkspaceActive == FamilyWorkspaceCreation {
		t.Fatal("one name for two resources is how the third FULL was abandoned")
	}
	if WorkspaceActiveLimit == 0 || WorkspaceCreationLimit24h == 0 {
		t.Fatal("limits must be compiled in from the service that enforces them")
	}
}

// The plan is DERIVED and compiled in; nothing here may be a typed constant.
func TestWorkspacePlanIsPresentAndPerActor(t *testing.T) {
	plan, ok := WorkspacePlan["FULL"]
	if !ok || len(plan) == 0 {
		t.Fatal("FULL must carry a derived workspace plan")
	}
	shared, ephemeral := 0, 0
	for _, r := range plan {
		switch r.Kind {
		case "SHARED":
			shared++
			if r.Actor == "" {
				t.Fatal("a shared actor must be named")
			}
		case "EPHEMERAL":
			ephemeral++
			if r.Actor != "" {
				t.Fatal("an ephemeral actor has no stable identity to name")
			}
		default:
			t.Fatalf("unknown actor kind %q", r.Kind)
		}
		if r.ConcurrentBarrier > r.Planned || r.ConcurrentNoBarrier != r.Planned {
			t.Fatalf("concurrency bounds are wrong for %+v: with the barrier the bound is "+
				"per journey, without it the sum", r)
		}
	}
	if shared == 0 || ephemeral == 0 {
		t.Fatalf("FULL spends from both kinds of actor: shared=%d ephemeral=%d", shared, ephemeral)
	}
}

func contains(h, n string) bool {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return true
		}
	}
	return false
}
