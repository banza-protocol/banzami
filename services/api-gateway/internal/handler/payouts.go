package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// PayoutHandler handles payout-related HTTP routes for the merchant-facing API.
type PayoutHandler struct {
	svc        service.PayoutService
	compliance service.ComplianceService
}

func NewPayoutHandler(svc service.PayoutService, compliance service.ComplianceService) *PayoutHandler {
	return &PayoutHandler{svc: svc, compliance: compliance}
}

type createPayoutBody struct {
	IdempotencyKey    string `json:"idempotency_key"`
	WalletID          string `json:"wallet_id"`
	AmountMinor       int64  `json:"amount_minor"`
	Currency          string `json:"currency"`
	BankAccountNumber string `json:"bank_account_number"`
	BankCode          string `json:"bank_code"`
	AccountHolderName string `json:"account_holder_name"`
}

// Create handles POST /v1/payouts.
//
// The merchant ID is taken from the authenticated principal.
// Returns 201 Created on success; 422 if the wallet has insufficient funds.
func (h *PayoutHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may request payouts")
		return
	}

	var body createPayoutBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}

	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.WalletID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "wallet_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
			"amount_minor must be a positive integer")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	case body.BankAccountNumber == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "bank_account_number is required")
		return
	case body.BankCode == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "bank_code is required")
		return
	case body.AccountHolderName == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "account_holder_name is required")
		return
	}

	// KYB gate: a merchant may only settle funds to a bank account once its
	// business verification (KYB + AML) is approved.
	//
	// FAIL-CLOSED: settlement is financially critical, so if the compliance
	// authority is unreachable we refuse the payout (503) rather than letting
	// an unverified merchant withdraw funds.
	if h.compliance != nil {
		status, cErr := h.compliance.GetMerchantStatus(r.Context(), principal.MerchantID)
		switch {
		case cErr != nil || status == nil:
			slog.Error("compliance merchant-status unavailable; refusing payout (fail-closed)",
				"merchant_id", principal.MerchantID, "error", cErr)
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"code":    "COMPLIANCE_UNAVAILABLE",
				"message": "A verificação de conformidade está indisponível. Tenta novamente em instantes.",
			})
			return
		case !status.CanProcess():
			writeJSON(w, http.StatusForbidden, map[string]any{
				"code":       "KYB_REQUIRED",
				"message":    "Business verification (KYB) must be approved before requesting a payout.",
				"kyb_status": status.KybStatus,
				"aml_status": status.AmlStatus,
			})
			return
		}
	}

	payout, err := h.svc.Create(r.Context(), service.CreatePayoutRequest{
		IdempotencyKey:    body.IdempotencyKey,
		MerchantID:        principal.MerchantID,
		WalletID:          body.WalletID,
		AmountMinor:       body.AmountMinor,
		Currency:          body.Currency,
		BankAccountNumber: body.BankAccountNumber,
		BankCode:          body.BankCode,
		AccountHolderName: body.AccountHolderName,
	})
	if err != nil {
		if errors.Is(err, service.ErrPayoutInsufficientFunds) {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS",
				"wallet does not have sufficient available funds for this payout")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"payout could not be created")
		return
	}

	respond(w, http.StatusCreated, payout)
}

// Get handles GET /v1/payouts/{id}.
func (h *PayoutHandler) Get(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may view payouts")
		return
	}

	payout, err := h.svc.Get(r.Context(), principal.MerchantID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrPayoutNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payout not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"payout could not be fetched")
		return
	}

	respond(w, http.StatusOK, payout)
}

// List handles GET /v1/payouts.
//
// Query parameters:
//   - limit  — 1–100, default 20
func (h *PayoutHandler) List(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may list payouts")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM",
				"limit must be an integer between 1 and 100")
			return
		}
		limit = parsed
	}

	payouts, err := h.svc.List(r.Context(), principal.MerchantID, limit)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"payouts could not be listed")
		return
	}
	if payouts == nil {
		payouts = []*service.Payout{}
	}

	respond(w, http.StatusOK, map[string]any{"data": payouts})
}
