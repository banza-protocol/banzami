package developer

// Retiring a project must retire its AUTHORITY, not just its name.
//
// Archiving used to leave the financial binding ACTIVE, so a project could be
// archived while its owner still answered to a live binding. That is the state
// a historical Sandbox merchant was found in: no balances, no ledger entries, no
// obligations — and an ACTIVE binding plus an unrevoked key, which is why its
// @banza could not safely be moved.
//
// A SEALED binding stays as it is. It records that this owner once issued a
// payer-facing artifact, and archiving the project does not make that untrue
// (ADR-055).

import (
	"testing"

	"github.com/google/uuid"
)

func TestRetireProject_RevokesKeysAndDisablesAnUnsealedBinding(t *testing.T) {
	s, _, pid := setupSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatalf("configure: %v", err)
	}
	if _, _, err := s.CreateAPIKey(bg, "u_owner", pid, KindSecret, "k", []string{"identity:read"}, "", ""); err != nil {
		t.Fatalf("key: %v", err)
	}

	revoked, err := s.RetireProject(bg, pid, "operator", "historical pre-launch project", "", "")
	if err != nil {
		t.Fatalf("retire: %v", err)
	}
	if revoked < 1 {
		t.Errorf("revoked %d keys, want at least the one just issued", revoked)
	}

	b, err := s.store.ActiveBindingForProject(bg, pid)
	if err != nil {
		t.Fatalf("binding read: %v", err)
	}
	if b != nil {
		t.Error("the binding is still ACTIVE after retirement — the project is archived " +
			"while its owner still answers to a live binding, which is the whole state " +
			"this retirement exists to clear")
	}
}

// A sealed binding is the immutable record of an artifact that was issued.
func TestRetireProject_LeavesASealedBindingAlone(t *testing.T) {
	s, _, pid := setupSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatalf("configure: %v", err)
	}
	b, _ := s.store.ActiveBindingForProject(bg, pid)
	if b == nil {
		t.Fatal("no binding to seal")
	}
	if err := s.store.MarkBindingArtifactCreated(bg, b.ID); err != nil {
		t.Skipf("cannot seal in this store: %v", err)
	}

	if _, err := s.RetireProject(bg, pid, "operator", "retiring a sealed project", "", ""); err != nil {
		t.Fatalf("retire: %v", err)
	}
	after, err := s.store.ActiveBindingForProject(bg, pid)
	if err != nil {
		t.Fatalf("binding read: %v", err)
	}
	if after == nil {
		t.Error("a SEALED binding was disabled — it is immutable (ADR-055) and records " +
			"that a payer-facing artifact was issued, which archiving does not undo")
	}
}

// The reason is the point: an audit that cannot say why authority was removed is
// not an audit.
func TestRetireProject_RequiresAReason(t *testing.T) {
	s, _, pid := setupSvc(t)
	if _, err := s.RetireProject(bg, pid, "operator", "   ", "", ""); err == nil {
		t.Error("a project was retired with no reason recorded")
	}
	if _, err := s.RetireProject(bg, pid, "operator", "why", "", ""); err != nil {
		t.Fatalf("retire with a reason: %v", err)
	}
	var found bool
	for _, a := range s.store.(*memStore).Audits {
		if a.Action == "project.retired" {
			found = true
			if a.Metadata == nil || a.Metadata["reason"] != "why" {
				t.Errorf("audit recorded metadata %v, want the reason as given", a.Metadata)
			}
			if a.Metadata != nil && a.Metadata["e2e_fixture"] == true {
				t.Error("a real retirement was audited as an e2e fixture")
			}
			// actor_user_id is a uuid column. A label must not be written into it:
			// the row is rejected and the retirement then reports success with no
			// record. The caller is recorded in metadata, where it can be read.
			if a.ActorUserID != nil {
				if _, err := uuid.Parse(*a.ActorUserID); err != nil {
					t.Errorf("actor_user_id = %q, which is not a uuid — this row cannot be "+
						"inserted, and the audit would be lost while the operation succeeded",
						*a.ActorUserID)
				}
			}
			if a.Metadata["requested_by"] != "operator" {
				t.Errorf("requested_by = %v, want the caller recorded where it is readable",
					a.Metadata["requested_by"])
			}
		}
	}
	if !found {
		t.Error("no project.retired audit event was written")
	}
}

// A project archived BEFORE binding-disable existed must still be repairable.
//
// Archiving used to return NotFound when the project was already ARCHIVED, which
// made retirement non-idempotent in the one way that mattered: the only
// operation that could disable a stranded binding declined to run on exactly the
// projects that had one. A historical Sandbox project was found in that state —
// ARCHIVED, and still holding an ACTIVE binding — and no supported call could
// move it.
func TestRetireProject_RepairsAnAlreadyArchivedProject(t *testing.T) {
	s, _, pid := setupSvc(t)
	if _, err := configureForTest(s, "u_owner", pid); err != nil {
		t.Fatalf("configure: %v", err)
	}

	// Archive the way the old code did: project only, binding untouched.
	mem := s.store.(*memStore)
	mem.projects[pid].Status = "ARCHIVED"
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b == nil {
		t.Fatal("fixture did not leave an ACTIVE binding, so there is nothing to repair")
	}

	if _, err := s.RetireProject(bg, pid, "operator", "repairing a stranded binding", "", ""); err != nil {
		t.Fatalf("retiring an already-archived project: %v — NotFound here is what left "+
			"a stranded binding unrepairable", err)
	}
	if b, _ := s.store.ActiveBindingForProject(bg, pid); b != nil {
		t.Error("the stranded ACTIVE binding survived retirement")
	}
}

// NotFound must still mean the project does not exist.
func TestRetireProject_UnknownProjectIsStillNotFound(t *testing.T) {
	s, _, _ := setupSvc(t)
	if _, err := s.RetireProject(bg, "prj_does_not_exist", "operator", "x", "", ""); err == nil {
		t.Error("retiring a project that does not exist succeeded")
	}
}

// isUUID is a shape check, and its negatives are the point: anything that is not
// a uuid must be kept out of a uuid column.
func TestIsUUID(t *testing.T) {
	for _, ok := range []string{
		"11111111-2222-4333-8444-555555555555",
		"AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
	} {
		if !isUUID(ok) {
			t.Errorf("%q rejected, want accepted", ok)
		}
	}
	for _, bad := range []string{
		"operator", "", "fixture-operator",
		"11111111-2222-4333-8444-55555555555",   // too short
		"11111111-2222-4333-8444-5555555555555", // too long
		"11111111x2222-4333-8444-555555555555",  // wrong separator
		"1111111g-2222-4333-8444-555555555555",  // non-hex
	} {
		if isUUID(bad) {
			t.Errorf("%q accepted, want rejected — it would be written into a uuid column "+
				"and the row silently lost", bad)
		}
	}
}
