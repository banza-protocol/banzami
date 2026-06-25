package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type WalletHandler struct {
	core *service.CoreAdminClient
}

func NewWalletHandler(core *service.CoreAdminClient) *WalletHandler {
	return &WalletHandler{core: core}
}

// GET /admin/v1/wallets?merchant_id=&currency=
func (h *WalletHandler) GetForMerchant(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	currency := r.URL.Query().Get("currency")
	if merchantID == "" || currency == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "MISSING_FIELD", "message": "merchant_id and currency are required"},
		})
		return
	}
	result, err := h.core.GetWallet(r.Context(), merchantID, currency)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "wallet not found"},
			})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "INTERNAL_ERROR", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /admin/v1/wallets/{id}/credit
func (h *WalletHandler) AdminCredit(w http.ResponseWriter, r *http.Request) {
	walletID := chi.URLParam(r, "id")

	var body struct {
		AmountMinor int64  `json:"amount_minor"`
		Currency    string `json:"currency"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "INVALID_BODY", "message": "request body must be valid JSON"},
		})
		return
	}
	if body.Reason == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "MISSING_FIELD", "message": "reason is required"},
		})
		return
	}
	if body.AmountMinor <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "INVALID_AMOUNT", "message": "amount_minor must be positive"},
		})
		return
	}
	currency := body.Currency
	if currency == "" {
		currency = "AOA"
	}

	result, err := h.core.AdminCreditWallet(r.Context(), walletID, body.AmountMinor, currency, body.Reason)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "wallet not found"},
			})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "BAD_REQUEST", "message": err.Error()},
		})
		return
	}
	writeJSON(w, http.StatusOK, result)
}
