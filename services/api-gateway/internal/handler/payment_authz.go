package handler

// Developer-key payment authorization for the canonical payment routes
// (ADR-047 / RT04B §5/§6). These helpers implement the strict rules a developer
// key must satisfy BEFORE any payment business logic, and keep the merchant-JWT
// path untouched (it retains its existing identity behavior).

import (
	"encoding/json"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// developerPayee is the payee authority derived EXCLUSIVELY from a Project's
// binding — never from the request body.
type developerPayee struct {
	merchantID      string
	walletID        string
	walletAccountID string
}

// developerPaymentAuthority resolves the developer-key payment authority for the
// request. Return values:
//   - (payee, false, true): a valid, scoped, bound developer key — use `payee`.
//   - (nil, true, true):     a developer key that FAILED authorization — the
//     response is already written; the handler must return immediately.
//   - (nil, false, false):   not a developer-key request — the handler proceeds
//     with its existing merchant-JWT logic.
//
// For a developer key it enforces, IN ORDER and all BEFORE business logic:
//  1. the required scope (read≠write; identity does not imply payment authority);
//  2. an ACTIVE binding (Bound + resolved payee ids) — an unbound/disabled/
//     malformed binding yields a controlled PAYMENTS_UNAVAILABLE, never a
//     default/fallback merchant.
func developerPaymentAuthority(w http.ResponseWriter, r *http.Request, scope string) (*developerPayee, bool, bool) {
	dp, ok := middleware.GetDeveloperPrincipal(r.Context())
	if !ok {
		return nil, false, false // merchant-JWT (or unauthenticated) — not our path
	}
	if !dp.HasScope(scope) {
		apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE", "missing required scope: "+scope)
		return nil, true, true
	}
	// Bound=false ⇒ no payment authority even with a payment scope. Require the
	// full resolved payee; anything less fails closed.
	if !dp.Bound || dp.MerchantID == "" || dp.WalletID == "" || dp.WalletAccountID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
			"this project is not provisioned to accept payments")
		return nil, true, true
	}
	return &developerPayee{merchantID: dp.MerchantID, walletID: dp.WalletID, walletAccountID: dp.WalletAccountID}, false, true
}

// rejectClientPayeeFields writes a 400 and returns true if a developer-key
// request body carries ANY payee-selection field. The payee derives ONLY from
// the Project binding, so a developer may never submit or override it.
func rejectClientPayeeFields(w http.ResponseWriter, r *http.Request, raw []byte) bool {
	var probe map[string]json.RawMessage
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &probe)
	}
	for _, k := range []string{"merchant_id", "wallet_id", "wallet_account_id", "payee", "payee_id", "payee_wallet"} {
		if _, present := probe[k]; present {
			apierror.Respond(w, r, http.StatusBadRequest, "PAYEE_NOT_ALLOWED",
				"payee is derived from your project binding; remove "+k)
			return true
		}
	}
	return false
}
