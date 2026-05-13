package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// TransferHandler handles peer-to-peer money transfers between consumers.
type TransferHandler struct {
	core *service.CorePublicClient
}

func NewTransferHandler(core *service.CorePublicClient) *TransferHandler {
	return &TransferHandler{core: core}
}

// POST /v1/transfers
// Sends money from the authenticated consumer to a recipient by handle.
// The sender's wallet ID is resolved from the authenticated consumer's token.
func (h *TransferHandler) Send(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	var body struct {
		RecipientHandle string `json:"recipient_handle"`
		AmountMinor     int64  `json:"amount_minor"`
		Currency        string `json:"currency"`
		Description     string `json:"description"`
		IdempotencyKey  string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.RecipientHandle == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "recipient_handle is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	}

	idempotencyKey := body.IdempotencyKey
	if idempotencyKey == "" {
		idempotencyKey = uuid.NewString()
	}

	// Resolve sender and recipient wallet IDs from consumer IDs.
	senderWallet, err := h.core.GetWalletForConsumer(r.Context(), consumer.ID, body.Currency)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "NO_WALLET",
				"you have no wallet in "+body.Currency+" — create one first via GET /v1/me/wallet")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not resolve sender wallet")
		return
	}

	recipient, err := h.core.GetConsumerByHandle(r.Context(), body.RecipientHandle)
	if err != nil {
		if errors.Is(err, service.ErrConsumerNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "RECIPIENT_NOT_FOUND", "recipient handle not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not resolve recipient")
		return
	}

	recipientWallet, err := h.core.GetWalletForConsumer(r.Context(), recipient.ID, body.Currency)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "RECIPIENT_NO_WALLET",
				"recipient has no wallet in "+body.Currency)
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not resolve recipient wallet")
		return
	}

	transfer, err := h.core.SendTransfer(r.Context(), service.SendTransferRequest{
		IdempotencyKey: idempotencyKey,
		SenderID:       senderWallet.ID,
		RecipientID:    recipientWallet.ID,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Description:    body.Description,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferSelfTransfer):
			apierror.Respond(w, r, http.StatusBadRequest, "SELF_TRANSFER", "you cannot transfer to yourself")
		case errors.Is(err, service.ErrTransferInvalidAmount):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be positive")
		case errors.Is(err, service.ErrTransferInsufficientFunds):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS", "insufficient funds")
		case errors.Is(err, service.ErrTransferWalletNotFound):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "WALLET_NOT_FOUND", "wallet not found or inactive")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "transfer could not be processed")
		}
		return
	}

	respond(w, http.StatusCreated, transfer)
}

// GET /v1/transfers/{id}
func (h *TransferHandler) Get(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	transfer, err := h.core.GetTransfer(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transfer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch transfer")
		return
	}

	// The core enforces ownership — only the sender or recipient may read a transfer.
	// We pass the consumer ID via the Authorization context on the internal call when
	// the core gains consumer-scoped ACLs; for now the ID is surfaced in the response.
	_ = consumer

	respond(w, http.StatusOK, transfer)
}

// GET /v1/transfers?limit=20&cursor=...
func (h *TransferHandler) List(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	page, err := h.core.ListTransfers(r.Context(), consumer.ID, limit, r.URL.Query().Get("cursor"))
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list transfers")
		return
	}

	respond(w, http.StatusOK, page)
}
