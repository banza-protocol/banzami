package handler

import (
	"encoding/json"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Transferências — internal transfer between two wallet accounts of the same
// bound financial owner (Banzami ADR-052).
//
// The smallest coherent transfer product, chosen deliberately: money moves
// between two child accounts the caller's owner already holds. Nothing crosses
// an owner boundary, which is what makes it safe to hand to a project key.
//
// This is not the generic merchant transfer surface withdrawn for security
// (RA-053) and does not restore it: there is no field here that can name a
// counterparty outside the caller's own owner, because both endpoints are
// validated against the caller's merchant — in the gateway AND again in Core.

type WalletAccountTransferHandler struct {
	svc service.WalletAccountTransferService
}

func NewWalletAccountTransferHandler(svc service.WalletAccountTransferService) *WalletAccountTransferHandler {
	return &WalletAccountTransferHandler{svc: svc}
}

type createTransferBody struct {
	SourceWalletAccountID      string `json:"source_wallet_account_id"`
	DestinationWalletAccountID string `json:"destination_wallet_account_id"`
	AmountMinor                int64  `json:"amount_minor"`
	Currency                   string `json:"currency"`
	IdempotencyKey             string `json:"idempotency_key"`
	Description                string `json:"description"`
}

// resolveTransferAuthority answers "whose accounts are these?".
//
// A transfer moves money. The owner is never taken from the request: a developer
// key's comes from its Project binding, a merchant JWT names itself. There is no
// merchant field on this route, so there is nothing for a caller to supply.
func (h *WalletAccountTransferHandler) resolveTransferAuthority(
	w http.ResponseWriter, r *http.Request, scope string,
) (string, bool) {
	if dp, isDev := middleware.GetDeveloperPrincipal(r.Context()); isDev {
		if !dp.HasScope(scope) {
			apierror.Respond(w, r, http.StatusForbidden, "INSUFFICIENT_SCOPE",
				"missing required scope: "+scope)
			return "", false
		}
		if !dp.Bound || dp.MerchantID == "" {
			apierror.Respond(w, r, http.StatusForbidden, "PAYMENTS_UNAVAILABLE",
				"this project is not provisioned to hold funds")
			return "", false
		}
		return dp.MerchantID, true
	}
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED",
			"valid credentials required")
		return "", false
	}
	return principal.MerchantID, true
}

// POST /v1/business/transfers
func (h *WalletAccountTransferHandler) Create(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.resolveTransferAuthority(w, r, "transfers:write")
	if !ok {
		return
	}

	var body createTransferBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}

	switch {
	case body.SourceWalletAccountID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"source_wallet_account_id is required")
		return
	case body.DestinationWalletAccountID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"destination_wallet_account_id is required")
		return
	case body.SourceWalletAccountID == body.DestinationWalletAccountID:
		// A self-transfer balances to nothing and would still appear in the
		// history as a movement. Refused rather than recorded.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_DESTINATION",
			"source and destination must be different accounts")
		return
	case body.AmountMinor <= 0:
		// Covers zero and negative. A negative amount would otherwise invert the
		// posting and move money the other way.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
			"amount_minor must be a positive integer in minor units")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	case !currencyRe.MatchString(body.Currency):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_CURRENCY",
			"currency must be a 3-letter ISO-4217 code")
		return
	case body.IdempotencyKey == "":
		// Required, not defaulted: a generated key would make every retry a new
		// transfer, which is the opposite of what a retry means.
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"idempotency_key is required")
		return
	}

	tr, err := h.svc.Create(r.Context(), service.CreateWalletAccountTransferInput{
		MerchantID:                 merchantID,
		SourceWalletAccountID:      body.SourceWalletAccountID,
		DestinationWalletAccountID: body.DestinationWalletAccountID,
		AmountMinor:                body.AmountMinor,
		Currency:                   body.Currency,
		IdempotencyKey:             body.IdempotencyKey,
		Description:                body.Description,
	})
	if err != nil {
		// Core's refusals are surfaced faithfully — insufficient funds, a foreign
		// account (404, indistinguishable from unknown), currency mismatch —
		// rather than collapsed into a 500.
		respondCoreError(w, r, err, "transfer could not be processed")
		return
	}
	respond(w, http.StatusCreated, tr)
}
