package handler

import (
	"encoding/json"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// TransactionHandler handles transaction-related HTTP routes.
type TransactionHandler struct {
	svc service.TransactionService
}

func NewTransactionHandler(svc service.TransactionService) *TransactionHandler {
	return &TransactionHandler{svc: svc}
}

type createTransactionBody struct {
	IdempotencyKey string `json:"idempotency_key"`
	AmountMinor    int64  `json:"amount_minor"`
	Currency       string `json:"currency"`
	Description    string `json:"description"`
}

// Create handles POST /v1/transactions.
//
// The merchant ID is taken from the authenticated principal — clients never
// supply it directly, preventing impersonation.
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"only merchant accounts may create transactions")
		return
	}

	var body createTransactionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY",
			"request body must be valid JSON")
		return
	}

	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"idempotency_key is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
			"amount_minor must be a positive integer in minor units (e.g. cêntimos for AOA)")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD",
			"currency is required (e.g. AOA, USD, EUR)")
		return
	}

	tx, err := h.svc.Create(r.Context(), service.CreateTransactionRequest{
		IdempotencyKey: body.IdempotencyKey,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Description:    body.Description,
		MerchantID:     principal.MerchantID,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"transaction could not be created")
		return
	}

	respond(w, http.StatusCreated, tx)
}
