package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// TestCreditHandler creates a completed PAYMENT transaction to fund a merchant
// wallet. Only for use in development/test environments.
type TestCreditHandler struct {
	core *service.CoreAdminClient
}

func NewTestCreditHandler(core *service.CoreAdminClient) *TestCreditHandler {
	return &TestCreditHandler{core: core}
}

type testCreditBody struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

// Credit handles POST /admin/v1/merchants/{id}/test-credit.
// Creates a PAYMENT transaction and immediately authorizes + captures it so the
// merchant's available balance increases by amount_minor.
func (h *TestCreditHandler) Credit(w http.ResponseWriter, r *http.Request) {
	merchantID := chi.URLParam(r, "id")

	var body testCreditBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AmountMinor <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "INVALID_BODY", "message": "amount_minor must be a positive integer"},
		})
		return
	}
	if body.Currency == "" {
		body.Currency = "AOA"
	}

	ctx := r.Context()

	// 1. Resolve wallet for this merchant + currency.
	wallet, err := h.core.GetWallet(ctx, merchantID, body.Currency)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": map[string]any{"code": "WALLET_NOT_FOUND", "message": fmt.Sprintf("no %s wallet for merchant %s", body.Currency, merchantID)},
		})
		return
	}
	walletID, _ := wallet["id"].(string)

	// 2. Create the transaction.
	tx, err := h.core.CreateTransaction(ctx, map[string]any{
		"idempotency_key":  uuid.NewString(),
		"transaction_type": "PAYMENT",
		"amount_minor":     body.AmountMinor,
		"currency":         body.Currency,
		"merchant_id":      merchantID,
		"wallet_id":        walletID,
		"description":      "Test credit (admin panel)",
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "TX_CREATE_FAILED", "message": err.Error()},
		})
		return
	}
	txID, _ := tx["id"].(string)

	// 3. Authorize → Capture.
	if _, err = h.core.AuthorizeTransaction(ctx, txID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "TX_AUTHORIZE_FAILED", "message": err.Error()},
		})
		return
	}
	result, err := h.core.CaptureTransaction(ctx, txID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]any{"code": "TX_CAPTURE_FAILED", "message": err.Error()},
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"transaction": result,
		"wallet_id":   walletID,
		"amount_minor": body.AmountMinor,
		"currency":    body.Currency,
	})
}
