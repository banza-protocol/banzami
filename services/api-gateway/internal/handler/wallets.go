package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type WalletHandler struct {
	svc service.WalletService
}

func NewWalletHandler(svc service.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

// POST /v1/wallets
// Provisions a new wallet for the authenticated merchant.
// Body: {"currency": "AOA"}
func (h *WalletHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}

	var body struct {
		Currency string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Currency == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "currency is required")
		return
	}

	wallet, err := h.svc.Create(r.Context(), principal.MerchantID, body.Currency)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDuplicateWallet):
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE_WALLET",
				"a wallet for this currency already exists")
		case errors.Is(err, service.ErrUnsupportedCurrency):
			apierror.Respond(w, r, http.StatusBadRequest, "UNSUPPORTED_CURRENCY",
				"currency is not supported")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
				"failed to create wallet")
		}
		return
	}

	writeJSON(w, http.StatusCreated, wallet)
}

// GET /v1/wallets/{id}
func (h *WalletHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	wallet, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"failed to retrieve wallet")
		return
	}

	writeJSON(w, http.StatusOK, wallet)
}

// GET /v1/wallets/{id}/balance
func (h *WalletHandler) Balance(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	balance, err := h.svc.Balance(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"failed to retrieve balance")
		return
	}

	writeJSON(w, http.StatusOK, balance)
}
