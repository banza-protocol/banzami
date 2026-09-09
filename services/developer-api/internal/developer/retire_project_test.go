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
)

func TestRetireProject_RevokesKeysAndDisablesAnUnsealedBinding(t *testing.T) {
	s, _, pid := setupSvc(t)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err != nil {
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
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", pid, "", ""); err != nil {
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
		}
	}
	if !found {
		t.Error("no project.retired audit event was written")
	}
}
