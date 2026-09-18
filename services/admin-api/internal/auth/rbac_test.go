package auth

import "testing"

func TestCan_SuperAdminHasEverything(t *testing.T) {
	for _, c := range []Capability{
		CapWalletCredit, CapOperatorManage, CapSettlementManage, CapDisputeResolve,
		CapApplicationApprove, CapKybAccept, CapRiskFreeze,
	} {
		if !Can(RoleSuperAdmin, c) {
			t.Fatalf("SUPER_ADMIN must hold %s", c)
		}
	}
}

func TestCan_RoleMatrix(t *testing.T) {
	cases := []struct {
		role string
		cap  Capability
		want bool
	}{
		// OPERATIONS runs the onboarding desk but cannot manage operators,
		// touch money, or act on KYB/AML.
		// … and decides nothing: approval is the KYB decision (ADR-058) and a
		// dispute resolution moves money.
		{"OPERATIONS", CapApplicationApprove, false},
		{"OPERATIONS", CapApplicationProcess, true},
		{"OPERATIONS", CapApplicationReject, true},
		{"OPERATIONS", CapDisputeResolve, false},
		{"OPERATIONS", CapMerchantView, true},
		{"OPERATIONS", CapOperatorManage, false},
		{"OPERATIONS", CapWalletCredit, false},
		{"OPERATIONS", CapKybAccept, false},
		{"OPERATIONS", CapSettlementManage, false},

		// COMPLIANCE owns KYB/AML/merchant standing, not operators or payouts.
		{"COMPLIANCE", CapKybAccept, true},
		{"COMPLIANCE", CapKybReject, true},
		{"COMPLIANCE", CapAmlFlag, true},
		{"COMPLIANCE", CapMerchantSuspend, true},
		{"COMPLIANCE", CapRiskResolve, true},
		{"COMPLIANCE", CapApplicationApprove, true},
		{"COMPLIANCE", CapDisputeResolve, false},
		{"COMPLIANCE", CapOperatorManage, false},
		{"COMPLIANCE", CapPayoutManage, false},

		// SUPPORT reads + recovers operator access, but no financial action and
		// no operator role/suspend changes.
		{"SUPPORT", CapOperatorRead, true},
		{"SUPPORT", CapOperatorReset, true},
		{"SUPPORT", CapMerchantView, true},
		{"SUPPORT", CapOperatorManage, false},
		{"SUPPORT", CapWalletCredit, false},
		{"SUPPORT", CapApplicationApprove, false},

		// READ_ONLY observes everything, mutates nothing.
		{"READ_ONLY", CapMerchantView, true},
		{"READ_ONLY", CapAuditView, true},
		{"READ_ONLY", CapApplicationApprove, false},
		{"READ_ONLY", CapOperatorManage, false},
		{"READ_ONLY", CapDisputeResolve, false},

		// Unknown roles get nothing.
		{"WHATEVER", CapDashboardView, false},
	}
	for _, tc := range cases {
		if got := Can(tc.role, tc.cap); got != tc.want {
			t.Errorf("Can(%q, %q) = %v, want %v", tc.role, tc.cap, got, tc.want)
		}
	}
}

// ── Banzami Validation Studio (Phase B) ─────────────────────────────────────

// The Studio's control-plane permissions are read-heavy on purpose: BANZADMIN
// starts and observes validation, it does not execute it. These assert who may
// do what, and — more usefully — who may not.
func TestCan_ValidationStudioMatrix(t *testing.T) {
	cases := []struct {
		role string
		cap  Capability
		want bool
		why  string
	}{
		// Observing is broad: a validation result nobody can read is not evidence.
		{"OPERATIONS", CapValidationView, true, "operations runs the desk and must see validation status"},
		{"COMPLIANCE", CapValidationView, true, "compliance observes platform state"},
		{"SUPPORT", CapValidationView, true, "support observes platform state"},
		{"READ_ONLY", CapValidationView, true, "read-only observes everything"},

		// Starting a run consumes real Sandbox capacity (the rolling merchant-credit
		// windows), so it is narrower than observing.
		{"OPERATIONS", CapValidationRun, true, "operations owns running validation"},
		{"COMPLIANCE", CapValidationRun, false, "compliance observes; it does not spend Sandbox capacity"},
		{"SUPPORT", CapValidationRun, false, "the help desk does not start validation runs"},
		{"READ_ONLY", CapValidationRun, false, "read-only changes nothing"},

		// Evidence carries real financial detail about synthetic actors, plus
		// traces and HARs. Narrower than the overview.
		{"OPERATIONS", CapValidationEvidence, true, "operations acts on findings"},
		{"READ_ONLY", CapValidationEvidence, false, "read-only sees status, not raw artifacts"},
		{"SUPPORT", CapValidationEvidence, false, "the help desk has no reason to open a trace"},

		// Actor lifecycle and configuration are SUPER_ADMIN only: an actor is a
		// real Sandbox identity holding real synthetic value, and its credential
		// references point at the secret backend.
		{"OPERATIONS", CapValidationActors, false, "actor lifecycle is SUPER_ADMIN only"},
		{"COMPLIANCE", CapValidationActors, false, "actor lifecycle is SUPER_ADMIN only"},
		{"OPERATIONS", CapValidationConfig, false, "registry and policy changes are SUPER_ADMIN only"},

		// Publishing to a public registry is irreversible — a version cannot be
		// republished with different content. No role holds it.
		{"OPERATIONS", CapValidationPublish, false, "SDK publication is SUPER_ADMIN + step-up"},
		{"COMPLIANCE", CapValidationPublish, false, "SDK publication is SUPER_ADMIN + step-up"},
		{"READ_ONLY", CapValidationPublish, false, "SDK publication is SUPER_ADMIN + step-up"},
	}
	for _, c := range cases {
		if got := Can(c.role, c.cap); got != c.want {
			t.Errorf("Can(%q, %q) = %v, want %v — %s", c.role, c.cap, got, c.want, c.why)
		}
	}
}

// SUPER_ADMIN short-circuits to "all", so the Studio capabilities must be
// reachable by it — otherwise the actor and publish paths would be unreachable
// by anyone, which is a different bug wearing the same green tick.
func TestCan_SuperAdminHoldsEveryValidationCapability(t *testing.T) {
	for _, cap := range []Capability{
		CapValidationView, CapValidationRun, CapValidationEvidence,
		CapValidationActors, CapValidationConfig, CapValidationPublish,
	} {
		if !Can(RoleSuperAdmin, cap) {
			t.Errorf("SUPER_ADMIN cannot %q", cap)
		}
	}
}

// An unknown role holds nothing. Deny by default is the property that makes the
// matrix above safe to extend.
func TestCan_UnknownRoleHoldsNoValidationCapability(t *testing.T) {
	for _, cap := range []Capability{CapValidationView, CapValidationRun, CapValidationPublish} {
		if Can("MARKETING", cap) {
			t.Errorf("an unknown role was granted %q", cap)
		}
	}
}
