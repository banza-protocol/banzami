package auth

// Capability is a single privileged action a role may or may not perform. All
// authorization in the admin-api flows through this matrix — handlers and
// middleware ask Can(role, capability) rather than testing role strings inline.
type Capability string

const (
	// Read surfaces (dashboards + list/detail views).
	CapDashboardView   Capability = "dashboard.view"
	CapOperatorRead    Capability = "operator.read"
	CapApplicationView Capability = "application.view"
	CapMerchantView    Capability = "merchant.view"
	CapConsumerView    Capability = "consumer.view"
	CapSettlementView  Capability = "settlement.view"
	CapPayoutView      Capability = "payout.view"
	CapReconView       Capability = "reconciliation.view"
	CapDisputeView     Capability = "dispute.view"
	CapRiskView        Capability = "risk.view"
	CapAuditView       Capability = "audit.view"
	CapPricingView     Capability = "pricing.view" // read pricing rules (ADR-021)

	// Operator lifecycle.
	CapOperatorManage Capability = "operator.manage" // create/update/role/suspend/activate
	CapOperatorReset  Capability = "operator.reset"  // reset password / resend invite / terminate sessions

	// Merchant onboarding (applications + KYB + compliance).
	CapApplicationApprove Capability = "application.approve"
	CapApplicationReject  Capability = "application.reject"
	CapKybAccept          Capability = "kyb.accept"
	CapKybReject          Capability = "kyb.reject"
	CapMerchantManage     Capability = "merchant.manage" // create/delete/verify/api-keys/wallets
	CapMerchantSuspend    Capability = "merchant.suspend"
	CapComplianceReview   Capability = "compliance.review" // approve/reject compliance merchant
	CapAmlFlag            Capability = "aml.flag"

	// Consumers.
	CapConsumerSuspend Capability = "consumer.suspend"
	CapConsumerBadge   Capability = "consumer.badge"

	// Financial actions.
	CapSettlementManage Capability = "settlement.manage" // create/submit/confirm/fail
	CapPayoutManage     Capability = "payout.manage"     // process/sent/confirm/fail/returned
	CapWalletCredit     Capability = "wallet.credit"
	CapReconRun         Capability = "reconciliation.run"
	CapPricingManage    Capability = "pricing.manage" // create/edit/version/disable pricing rules (ADR-021)

	// Dispute + risk operations.
	CapDisputeResolve Capability = "dispute.resolve"
	CapRiskResolve    Capability = "risk.resolve" // resolve flags / acquiring recon
	CapRiskFreeze     Capability = "risk.freeze"
)

// RoleSuperAdmin holds every capability implicitly (see Can).
const RoleSuperAdmin = "SUPER_ADMIN"

// roleCapabilities is the central permission matrix. SUPER_ADMIN is intentionally
// absent — Can short-circuits it to "all". A role missing from the map has no
// capabilities (deny by default).
var roleCapabilities = map[string]map[Capability]bool{
	// OPERATIONS — run the onboarding desk: review/approve/reject applications,
	// see merchants/consumers/payments, resolve disputes. No operator admin, no
	// money movement, no KYB/AML/compliance authority.
	"OPERATIONS": capSet(
		CapDashboardView, CapApplicationView, CapApplicationApprove, CapApplicationReject,
		CapMerchantView, CapConsumerView, CapSettlementView, CapPayoutView,
		CapReconView, CapDisputeView, CapDisputeResolve, CapRiskView, CapPricingView,
	),

	// COMPLIANCE — owns KYC/AML/KYB and merchant standing. Can accept/reject KYB
	// documents, flag AML, approve/reject/suspend merchants, resolve risk flags,
	// read the audit log. No operator admin, no settlement/payout execution.
	"COMPLIANCE": capSet(
		CapDashboardView, CapApplicationView, CapMerchantView, CapConsumerView,
		CapKybAccept, CapKybReject, CapMerchantSuspend, CapComplianceReview, CapAmlFlag,
		CapConsumerSuspend, CapRiskView, CapRiskResolve, CapRiskFreeze, CapAuditView,
		CapPricingView,
	),

	// SUPPORT — help desk. Read operators/merchants/consumers/payments and reset
	// operator passwords / resend invites (account recovery). NO financial action,
	// NO merchant approval, NO operator role/suspend changes.
	"SUPPORT": capSet(
		CapDashboardView, CapOperatorRead, CapOperatorReset, CapApplicationView,
		CapMerchantView, CapConsumerView, CapSettlementView, CapPayoutView,
		CapReconView, CapDisputeView, CapRiskView, CapAuditView, CapPricingView,
	),

	// READ_ONLY — observe everything, change nothing.
	"READ_ONLY": capSet(
		CapDashboardView, CapOperatorRead, CapApplicationView, CapMerchantView,
		CapConsumerView, CapSettlementView, CapPayoutView, CapReconView,
		CapDisputeView, CapRiskView, CapAuditView, CapPricingView,
	),
}

func capSet(caps ...Capability) map[Capability]bool {
	m := make(map[Capability]bool, len(caps))
	for _, c := range caps {
		m[c] = true
	}
	return m
}

// Can reports whether role is allowed to perform cap. SUPER_ADMIN always can;
// every other role is governed strictly by roleCapabilities (deny by default).
func Can(role string, cap Capability) bool {
	if role == RoleSuperAdmin {
		return true
	}
	return roleCapabilities[role][cap]
}
