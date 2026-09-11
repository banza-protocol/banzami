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
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GET /admin/v1/wallets/{id}/accounts — read-only operator visibility into a
// wallet's segregated accounts (ADR-042). Balances are read from the ledger; the
// operator never mutates them here.
func (h *WalletHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	walletID := chi.URLParam(r, "id")
	if walletID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "MISSING_FIELD", "message": "wallet id is required"},
		})
		return
	}
	result, err := h.core.ListWalletAccounts(r.Context(), walletID)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "wallet not found"},
			})
			return
		}
		handleCoreErr(w, err)
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
	// One credit per click. Without a key a double submit, a retry after a
	// timeout or a replayed request each created the money again.
	idemKey := r.Header.Get("Idempotency-Key")
	if idemKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "IDEMPOTENCY_KEY_REQUIRED", "message": "an Idempotency-Key header is required for a wallet credit"},
		})
		return
	}

	result, err := h.core.AdminCreditWallet(r.Context(), walletID, body.AmountMinor, currency, body.Reason, idemKey)
	if err != nil {
		var ce *service.CoreError
		if errors.As(err, &ce) && ce.Status == http.StatusConflict {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": map[string]any{"code": ce.Code, "message": ce.Message},
			})
			return
		}
		if errors.Is(err, service.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": map[string]any{"code": "NOT_FOUND", "message": "wallet not found"},
			})
			return
		}
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "wallet", walletID, map[string]any{
		"wallet_id":    walletID,
		"amount_minor": body.AmountMinor,
		"currency":     currency,
		"reason":       body.Reason,
	})
	writeJSON(w, http.StatusOK, result)
}
