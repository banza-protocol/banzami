package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ApplicationSettlementHandler is the app-facing surface for an application (e.g.
// DOA) to settle accumulated net value from one of its own wallets to a
// beneficiary, splitting off an application fee — all money movement done by the
// operator. The app never sees ledger account ids and never computes the fee.
type ApplicationSettlementHandler struct {
	settlements service.ApplicationSettlementService
	wallets     service.WalletService
}

func NewApplicationSettlementHandler(s service.ApplicationSettlementService, w service.WalletService) *ApplicationSettlementHandler {
	return &ApplicationSettlementHandler{settlements: s, wallets: w}
}

// POST /v1/application-settlements
func (h *ApplicationSettlementHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}
	var body struct {
		IdempotencyKey         string `json:"idempotency_key"`
		OwnerRef               string `json:"owner_ref"`
		SourceWalletID         string `json:"source_wallet_id"`
		BeneficiaryWalletID    string `json:"beneficiary_wallet_id"`
		ApplicationFeeWalletID string `json:"application_fee_wallet_id"`
		FeePolicyRef           string `json:"fee_policy_ref"`
		BusinessCategory       string `json:"business_category"`
		PricingProfile         string `json:"pricing_profile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.SourceWalletID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "source_wallet_id is required")
		return
	case body.BeneficiaryWalletID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "beneficiary_wallet_id is required")
		return
	}

	// Ownership: an app may only settle FROM a wallet it owns, and may only direct
	// the application fee to a wallet it owns. The beneficiary is unrestricted.
	src, err := h.wallets.Get(r.Context(), body.SourceWalletID)
	if err != nil || src == nil || src.MerchantID != principal.MerchantID {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "source_wallet_id is not owned by this merchant")
		return
	}
	if body.ApplicationFeeWalletID != "" {
		fee, ferr := h.wallets.Get(r.Context(), body.ApplicationFeeWalletID)
		if ferr != nil || fee == nil || fee.MerchantID != principal.MerchantID {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "application_fee_wallet_id is not owned by this merchant")
			return
		}
	}

	// Gross = the source wallet's available balance, read from Banzami (the app
	// never computes or sends an amount).
	bal, err := h.wallets.Balance(r.Context(), body.SourceWalletID)
	if err != nil || bal == nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not read source wallet balance")
		return
	}
	if bal.AvailableMinor <= 0 {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "NOTHING_TO_SETTLE", "source wallet has no available balance")
		return
	}

	st, err := h.settlements.Create(r.Context(), service.CreateApplicationSettlementInput{
		IdempotencyKey:         body.IdempotencyKey,
		OwnerRef:               body.OwnerRef,
		SourceWalletID:         body.SourceWalletID,
		BeneficiaryWalletID:    body.BeneficiaryWalletID,
		ApplicationFeeWalletID: body.ApplicationFeeWalletID,
		GrossAmountMinor:       bal.AvailableMinor,
		Currency:               src.Currency,
		FeePolicyRef:           body.FeePolicyRef,
		BusinessCategory:       body.BusinessCategory,
		PricingProfile:         body.PricingProfile,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create settlement")
		return
	}

	// Execute it: a fresh settlement is CREATED → complete it to post the ledger.
	// An idempotent retry may already be terminal — return it as-is.
	if st.Status == "CREATED" || st.Status == "PENDING" {
		completed, cerr := h.settlements.Complete(r.Context(), st.ID)
		if cerr != nil {
			// The settlement exists but could not be completed (e.g. insufficient
			// funds). Surface it; the app keeps the campaign settlement-pending/failed.
			slog.ErrorContext(r.Context(), "application_settlement.complete.failed", "settlement_id", st.ID, "error", cerr)
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "SETTLEMENT_NOT_COMPLETED", "settlement could not be completed")
			return
		}
		st = completed
	}

	slog.InfoContext(r.Context(), "application_settlement.executed",
		"settlement_id", st.ID, "owner_ref", st.OwnerRef, "status", st.Status)
	respond(w, http.StatusCreated, st)
}

// GET /v1/application-settlements/{id}
func (h *ApplicationSettlementHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}
	st, err := h.settlements.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil || st == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "settlement not found")
		return
	}
	respond(w, http.StatusOK, st)
}
