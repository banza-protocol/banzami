package developer

// Financial Setup must produce a Business that can SETTLE, not merely receive.
//
// It created a merchant, a wallet and its PRIMARY account and stopped there.
// Application settlement names its parties by @banza, so a Business with no
// handle cannot be named — not as a beneficiary, and not as its own
// application-fee destination. Zero of the five Sandbox owners the platform had
// provisioned had one, so POST /v1/application-settlements was
// unreachable for every ordinary external Developer Project. ADR-028 separately
// requires a KYB-approved fee destination, which nothing public could produce.

import (
	"errors"
	"testing"
)

func TestFinancialSetup_ProvisionsBusinessReadiness(t *testing.T) {
	s, f, proj := setupSvc(t)

	out, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", "")
	if err != nil {
		t.Fatalf("configure: %v", err)
	}
	if out.State != FinancialReady {
		t.Fatalf("state = %q, want READY", out.State)
	}
	if f.readinessCount() != 1 {
		t.Fatalf("readiness called %d times, want 1 — a Business that cannot be named "+
			"cannot settle, and the project was reported READY anyway", f.readinessCount())
	}
	if f.gotReadinessPrj != proj {
		t.Errorf("readiness asked for project %q, want %q — the handle must derive from "+
			"the project, never from anything the developer supplies", f.gotReadinessPrj, proj)
	}
	if f.gotReadinessFor == "" {
		t.Error("readiness was not given the merchant it must complete")
	}
}

// READY is a promise. A project that cannot be made settlement-capable must not
// be told it is ready, and must remain resumable rather than half-provisioned.
func TestFinancialSetup_ReadinessFailureLeavesTheProjectUnready(t *testing.T) {
	s, f, proj := setupSvc(t)
	f.readinessErr = errors.New("core unavailable")

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err == nil {
		t.Fatal("configure succeeded while the Business could not be made settlement-capable")
	}
	after, err := s.ProjectFinancialSetup(bg, "u_owner", proj)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if after.State == FinancialReady || after.State == FinancialSealed {
		t.Fatalf("state = %q after a failed readiness step — READY must mean the lifecycle "+
			"it advertises actually completes", after.State)
	}
}

// The public path must never reach readiness outside Sandbox. Core refuses it
// too; this is the first of two gates, not the only one.
func TestFinancialSetup_NoReadinessOutsideSandbox(t *testing.T) {
	s, f, proj := setupSvc(t)
	s.SetSandboxEnvironment(false)

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err == nil {
		t.Fatal("financial setup ran outside Sandbox")
	}
	if f.readinessCount() != 0 {
		t.Fatalf("readiness ran %d times outside Sandbox — KYB was approved where it must "+
			"stay fail-closed", f.readinessCount())
	}
}

// Projects provisioned before readiness existed converge through the SAME public
// call, not a migration or an operator sweep. Five Sandbox owners had no @banza
// handle and could never settle; a developer pressing Configure completes them.
//
// Repeating it is safe because Core is idempotent: one handle, one Business, and
// an existing compliance decision is never overwritten.
func TestFinancialSetup_AnAlreadyConfiguredProjectIsConvergedByTheSameCall(t *testing.T) {
	s, f, proj := setupSvc(t)

	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err != nil {
		t.Fatalf("first configure: %v", err)
	}
	for i := 0; i < 3; i++ {
		if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err != nil {
			t.Fatalf("repeat configure: %v", err)
		}
	}
	// Four calls, four readiness ensures — each a no-op in Core after the first.
	// The owner itself is provisioned once and only once.
	if f.readinessCount() != 4 {
		t.Fatalf("readiness ran %d times across four configure calls — an already-bound "+
			"project must still be completed, which is how pre-existing owners converge",
			f.readinessCount())
	}
	if f.callCount() != 1 {
		t.Fatalf("the owner was provisioned %d times — convergence must not create a second "+
			"merchant", f.callCount())
	}
}
