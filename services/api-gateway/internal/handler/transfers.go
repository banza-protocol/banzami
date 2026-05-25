package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/notify"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type TransferHandler struct {
	svc service.TransferService
	fcm *notify.FCMService
}

func NewTransferHandler(svc service.TransferService, fcm *notify.FCMService) *TransferHandler {
	return &TransferHandler{svc: svc, fcm: fcm}
}

// POST /v1/transfers
func (h *TransferHandler) Send(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IdempotencyKey string  `json:"idempotency_key"`
		SenderID       string  `json:"sender_id"`
		RecipientID    string  `json:"recipient_id"`
		AmountMinor    int64   `json:"amount_minor"`
		Currency       string  `json:"currency"`
		Description    string  `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.SenderID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "sender_id is required")
		return
	case body.RecipientID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "recipient_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer in minor units")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	}

	transfer, err := h.svc.Send(r.Context(), service.SendTransferRequest{
		IdempotencyKey: body.IdempotencyKey,
		SenderID:       body.SenderID,
		RecipientID:    body.RecipientID,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Description:    body.Description,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferSelfTransfer):
			apierror.Respond(w, r, http.StatusBadRequest, "SELF_TRANSFER", "sender and recipient must be different")
		case errors.Is(err, service.ErrTransferInvalidAmount):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be positive")
		case errors.Is(err, service.ErrTransferInsufficientFunds):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS", "sender has insufficient funds")
		case errors.Is(err, service.ErrTransferWalletNotFound):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "WALLET_NOT_FOUND", "sender or recipient has no active wallet")
		case errors.Is(err, service.ErrTransferWalletInactive):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "WALLET_NOT_ACTIVE", "wallet is suspended")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "transfer could not be processed")
		}
		return
	}

	go h.notifyRecipient(transfer)

	respond(w, http.StatusCreated, transfer)
}

// notifyRecipient sends a best-effort FCM push to the transfer recipient.
// Runs in a goroutine so it never delays the HTTP response.
func (h *TransferHandler) notifyRecipient(t *service.Transfer) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	slog.Info("[FCM] event created",
		"event",        "payment_received",
		"recipient_id", t.RecipientID,
		"amount_minor", t.Amount.AmountMinor,
	)
	h.fcm.SendPaymentReceived(ctx, t.RecipientID, t.SenderID, t.Amount.AmountMinor, t.Amount.Currency, t.ID)
}

// GET /v1/transfers/{id}
func (h *TransferHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	transfer, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrTransferNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transfer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch transfer")
		return
	}
	respond(w, http.StatusOK, transfer)
}

// GET /v1/transfers?consumer_id=X&limit=20&cursor=...
func (h *TransferHandler) List(w http.ResponseWriter, r *http.Request) {
	consumerID := r.URL.Query().Get("consumer_id")
	if consumerID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "consumer_id is required")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be an integer between 1 and 100")
			return
		}
		limit = parsed
	}

	page, err := h.svc.List(r.Context(), consumerID, limit, r.URL.Query().Get("cursor"))
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list transfers")
		return
	}

	respond(w, http.StatusOK, page)
}
