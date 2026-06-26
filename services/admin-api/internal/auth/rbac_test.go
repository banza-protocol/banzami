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
		{"OPERATIONS", CapApplicationApprove, true},
		{"OPERATIONS", CapDisputeResolve, true},
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
		{"COMPLIANCE", CapApplicationApprove, false},
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
