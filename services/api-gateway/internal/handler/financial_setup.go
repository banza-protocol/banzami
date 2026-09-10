package handler

// GET /v1/financial-setup — a Project's own financial readiness.
//
// The one question an integrating application asks before it offers a
// settlement: is my Project set up to settle, and if not, what is missing? The
// Project key is the authority; nothing in the request names a Project, an
// owner or an account. The answer comes from core's readiness engine, which
// evaluates every prerequisite with the function settlement itself calls — so
// settlement.ready is true exactly when those prerequisites pass, and each
// blocker is the refusal settlement would return.
//
// What the response never contains: the financial owner, wallet, account,
// binding or rule ids behind the Project. They are the operator's. The Project's
// own id is not among them — it is the developer's, shown in their Console.

import (
	"errors"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Settlement currency. The Sandbox settles in Kwanza only.
const readinessCurrency = "AOA"

type FinancialSetupHandler struct {
	readiness service.SettlementReadinessService
	parties   service.PartyResolver
}

func NewFinancialSetupHandler(readiness service.SettlementReadinessService, parties service.PartyResolver) *FinancialSetupHandler {
	return &FinancialSetupHandler{readiness: readiness, parties: parties}
}

// FinancialSetup serves GET /v1/financial-setup.
//
// Optional query: fee_destination=@banza — evaluate that account as the fee
// destination instead of the Project's own financial identity.
func (h *FinancialSetupHandler) FinancialSetup(w http.ResponseWriter, r *http.Request) {
	p, ok := middleware.GetDeveloperPrincipal(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	// The same scope as GET /v1/me: this is the Project describing itself, and a
	// key that may read its identity may read whether that identity can settle.
	if !p.HasScope("identity:read") {
		apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: identity:read")
		return
	}

	body := map[string]any{
		"environment": p.Environment,
		"project": map[string]any{
			"id":   p.ProjectID,
			"name": p.ProjectName,
			"ref":  p.ProjectSlug,
		},
	}

	// A Project without a financial owner is a state, not an error: every
	// Project starts here, and its owner configures it in the Console.
	if !p.Bound || p.MerchantID == "" {
		for k, v := range unconfiguredReadiness() {
			body[k] = v
		}
		writeJSON(w, http.StatusOK, body)
		return
	}
	if h.readiness == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "financial readiness is temporarily unavailable")
		return
	}

	var fee *service.ReadinessFeeDestination
	if name := strings.TrimSpace(r.URL.Query().Get("fee_destination")); name != "" {
		resolved, err := h.resolveNamed(r, name, p.MerchantID)
		if err != nil {
			apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "financial readiness is temporarily unavailable")
			return
		}
		fee = resolved
	}

	res, err := h.readiness.Readiness(r.Context(), p.MerchantID, readinessCurrency, fee)
	if err != nil {
		var ce *service.CoreError
		switch {
		// The Project is bound to an owner core does not hold. Nothing the
		// developer did or can fix: the configuration and the ledger disagree.
		case errors.Is(err, service.ErrNotFound):
			apierror.Respond(w, r, http.StatusConflict, "FINANCIAL_SETUP_CONFLICT",
				"this project's financial setup does not match an account; contact support")
		case errors.As(err, &ce) && ce.Status < 500:
			apierror.Respond(w, r, http.StatusConflict, "FINANCIAL_SETUP_CONFLICT",
				"this project's financial setup could not be evaluated; contact support")
		// An outage is never reported as a configuration fact.
		default:
			apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "financial readiness is temporarily unavailable")
		}
		return
	}

	state := "READY"
	if p.Sealed {
		state = "SEALED"
	}
	body["financial_setup"] = map[string]any{"state": state, "configured": true, "sealed": p.Sealed}
	for k, v := range projectReadiness(res) {
		body[k] = v
	}
	writeJSON(w, http.StatusOK, body)
}

// resolveNamed turns a @banza into the fee destination core evaluates. A handle
// that resolves to nothing is reported as such by core (FEE_DESTINATION_NOT_FOUND);
// only a resolver that could not answer is an error.
func (h *FinancialSetupHandler) resolveNamed(r *http.Request, name, merchantID string) (*service.ReadinessFeeDestination, error) {
	out := &service.ReadinessFeeDestination{Handle: strings.ToLower(strings.TrimPrefix(name, "@"))}
	if h.parties == nil {
		return nil, errors.New("party resolver not configured")
	}
	party, err := h.parties.Resolve(r.Context(), name, readinessCurrency)
	if errors.Is(err, service.ErrNotFound) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if party != nil && party.AvailableAccountID != "" {
		out.AccountID = party.AvailableAccountID
		out.Owned = party.OwnerType == "MERCHANT" && party.OwnerID == merchantID
	}
	return out, nil
}

func atHandle(h *string) any {
	if h == nil || *h == "" {
		return nil
	}
	return "@" + strings.TrimPrefix(*h, "@")
}

// projectReadiness is the public projection of core's readiness. Field for
// field what core decided; nothing is recomputed here.
func projectReadiness(res *service.SettlementReadiness) map[string]any {
	fd := res.FeeDestination
	blockers := res.Settlement.Blockers
	if blockers == nil {
		blockers = []string{}
	}
	warnings := res.Settlement.Warnings
	if warnings == nil {
		warnings = []string{}
	}
	return map[string]any{
		"financial_identity": map[string]any{"handle": atHandle(res.FinancialIdentity.Handle)},
		"kyb":                map[string]any{"status": res.Kyb.Status},
		"wallet": map[string]any{
			"status":   res.Wallet.Status,
			"ready":    res.Wallet.Ready,
			"currency": res.Wallet.Currency,
		},
		"pricing": map[string]any{
			"profile":        res.Pricing.Profile,
			"settlement_bps": res.Pricing.SettlementBps,
			"payout_bps":     res.Pricing.PayoutBps,
		},
		"fee_destination": map[string]any{
			"handle": atHandle(fd.Handle),
			// Whether the operator's pricing charges a fee at all. When it does
			// not, the destination is reported and blocks nothing.
			"required":         fd.Required,
			"resolved":         fd.Resolved,
			"owned_by_project": fd.OwnedByProject,
			"kyb_approved":     fd.KybApproved,
			"wallet_active":    fd.WalletActive,
			"type_allowed":     fd.TypeAllowed,
			// ADR-028 credits the fee to the destination's own account; no
			// dedicated application account exists or is required. Ready means
			// that account can receive.
			"application_account_ready": fd.Resolved && fd.WalletActive,
			"eligible":                  fd.Eligible,
			"blocker":                   fd.Blocker,
		},
		"settlement": map[string]any{
			"ready":    res.Settlement.Ready,
			"blockers": blockers,
			"warnings": warnings,
		},
	}
}

// unconfiguredReadiness is a Project with no financial owner: the same shape,
// every fact absent, and the one blocker that says why.
func unconfiguredReadiness() map[string]any {
	return map[string]any{
		"financial_setup":    map[string]any{"state": "UNCONFIGURED", "configured": false, "sealed": false},
		"financial_identity": map[string]any{"handle": nil},
		"kyb":                map[string]any{"status": nil},
		"wallet":             map[string]any{"status": nil, "ready": false, "currency": readinessCurrency},
		"pricing":            map[string]any{"profile": nil, "settlement_bps": nil, "payout_bps": nil},
		"fee_destination": map[string]any{
			"handle": nil, "required": false, "resolved": false, "owned_by_project": false,
			"kyb_approved": false, "wallet_active": false, "type_allowed": false,
			"application_account_ready": false, "eligible": false, "blocker": nil,
		},
		"settlement": map[string]any{
			"ready":    false,
			"blockers": []string{"FINANCIAL_SETUP_NOT_CONFIGURED"},
			"warnings": []string{},
		},
	}
}
