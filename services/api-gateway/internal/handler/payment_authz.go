package handler

// Developer-key payment authorization for the canonical payment routes
// (ADR-047 / RT04B §5/§6). These helpers implement the strict rules a developer
// key must satisfy BEFORE any payment business logic, and keep the merchant-JWT
// path untouched (it retains its existing identity behavior).

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
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
	return resolveDeveloperPaymentAuthority(w, r, scope, nil)
}

// bindingSealer is satisfied by *service.BindingSealService.
type bindingSealer interface {
	SealForArtifact(ctx context.Context, projectID, merchantID, walletID string) error
}

// developerPaymentAuthorityForArtifact is the authority path for routes that
// ISSUE a payer-facing payment artifact (ADR-055). It resolves the payee exactly
// as the read path does and then SEALS the binding before the artifact exists,
// so an issued link or session can never have its payee reinterpreted.
//
// Sealing is a distinct function rather than a flag because a new payment route
// should have to say which of the two it is. A route that quietly gets the
// read-only variant is the bug this split exists to make visible — and
// paymentroutes_seal_test.go fails if a write scope reaches the wrong one.
func developerPaymentAuthorityForArtifact(w http.ResponseWriter, r *http.Request, scope string, seal bindingSealer) (*developerPayee, bool, bool) {
	return resolveDeveloperPaymentAuthority(w, r, scope, seal)
}

func resolveDeveloperPaymentAuthority(w http.ResponseWriter, r *http.Request, scope string, seal bindingSealer) (*developerPayee, bool, bool) {
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
	payee := &developerPayee{merchantID: dp.MerchantID, walletID: dp.WalletID, walletAccountID: dp.WalletAccountID}
	if seal == nil {
		return payee, false, true
	}
	// The seal also re-checks that this payee is STILL the project's ACTIVE
	// binding. The principal carries a snapshot from key introspection; between
	// then and now an operator correction may have moved it, and issuing an
	// artifact against the stale payee is exactly the split-brain ADR-055
	// forbids.
	switch err := seal.SealForArtifact(r.Context(), dp.ProjectID, dp.MerchantID, dp.WalletID); {
	case err == nil:
	case errors.Is(err, service.ErrBindingMoved):
		apierror.Respond(w, r, http.StatusConflict, "BINDING_CHANGED",
			"this project's payment binding changed — retry the request")
		return nil, true, true
	default:
		apierror.Respond(w, r, http.StatusServiceUnavailable, "PAYMENTS_UNAVAILABLE",
			"payment authority could not be confirmed")
		return nil, true, true
	}
	return payee, false, true
}

// rejectClientPayeeFields writes a 400 and returns true if a developer-key
// request body carries ANY payee-selection field. The payee derives ONLY from
// the Project binding, so a developer may never submit or override it.
func rejectClientPayeeFields(w http.ResponseWriter, r *http.Request, raw []byte) bool {
	var probe map[string]json.RawMessage
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &probe)
	}
	// wallet_account_id is deliberately ABSENT from this list. It selects a
	// sub-account WITHIN the owner the binding already fixed, which an
	// application legitimately needs (segregating funds per campaign, per
	// tenant, per order). Ownership of the requested account is verified
	// against the binding by authorizeDeveloperSubAccount — the id selects a
	// child, it never confers authority over the parent owner.
	for _, k := range []string{"merchant_id", "wallet_id", "payee", "payee_id", "payee_wallet"} {
		if _, present := probe[k]; present {
			apierror.Respond(w, r, http.StatusBadRequest, "PAYEE_NOT_ALLOWED",
				"payee is derived from your project binding; remove "+k)
			return true
		}
	}
	return false
}

// walletAccountLookup is the narrow read the sub-account authority check needs.
// Kept minimal on purpose: this path must not acquire the ability to mutate.
type walletAccountLookup interface {
	Get(ctx context.Context, id string) (*service.WalletAccount, error)
}

// authorizeDeveloperSubAccount resolves WHICH account a developer-key payment
// credits, within the owner its project binding already established.
//
// The distinction this enforces is the whole point of the model:
//
//	choosing an OWNER      — forbidden. merchant_id/wallet_id/payee are rejected
//	                         outright by rejectClientPayeeFields; a client that
//	                         could name its own owner could name someone else's.
//	choosing a SUB-ACCOUNT — allowed, but only among accounts belonging to the
//	                         wallet the binding resolved. An application needs
//	                         this (a donations platform segregates per campaign);
//	                         it is a child selection, never a grant of authority
//	                         over the parent.
//
// An omitted id keeps the previous behaviour: the binding's default account.
//
// A foreign or unknown account is refused as NOT_FOUND, not FORBIDDEN: telling a
// caller that an id exists but belongs to someone else is itself a disclosure,
// and would let one project enumerate another's accounts by status code.
func authorizeDeveloperSubAccount(
	w http.ResponseWriter, r *http.Request,
	accounts walletAccountLookup, dev *developerPayee, requested string,
) (walletAccountID string, ok bool) {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return dev.walletAccountID, true // the binding's default account
	}
	if accounts == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "wallet accounts are unavailable")
		return "", false
	}
	acc, err := accounts.Get(r.Context(), requested)
	if err != nil || acc == nil || acc.WalletID != dev.walletID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet account not found")
		return "", false
	}
	return acc.ID, true
}
