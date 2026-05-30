package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/banza-protocol/banzami/services/public-api/internal/apierror"
	"github.com/banza-protocol/banzami/services/public-api/internal/middleware"
	"github.com/banza-protocol/banzami/services/public-api/internal/notify"
	"github.com/banza-protocol/banzami/services/public-api/internal/service"
)

// consumerPayLinkExecutor is satisfied by *service.CorePublicClient and by test fakes.
type consumerPayLinkExecutor interface {
	GetConsumerPayLinkByCode(ctx context.Context, code string) (*service.ConsumerPayLink, error)
	CreateConsumerPayLink(ctx context.Context, req service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
	PayConsumerPayLink(ctx context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
}

// ConsumerPayLinkHandler handles consumer-facing pay link operations.
type ConsumerPayLinkHandler struct {
	core    consumerPayLinkExecutor
	handles senderHandleResolver
	fcm     *notify.FCMService
}

func NewConsumerPayLinkHandler(core *service.CorePublicClient, handles *service.CredentialStore, fcm *notify.FCMService) *ConsumerPayLinkHandler {
	return &ConsumerPayLinkHandler{core: core, handles: handles, fcm: fcm}
}

func newConsumerPayLinkHandlerWithFakes(exec consumerPayLinkExecutor) *ConsumerPayLinkHandler {
	return &ConsumerPayLinkHandler{core: exec}
}

// GET /v1/consumer-pay-links/:code
// Public — no authentication required. Used by the pay web app to render /r/:code.
func (h *ConsumerPayLinkHandler) GetByCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	link, err := h.core.GetConsumerPayLinkByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, service.ErrConsumerPayLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer pay link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch pay link")
		return
	}
	respond(w, http.StatusOK, link)
}

// POST /v1/consumer-pay-links
// Authenticated — creates a new pay link for the authenticated consumer.
func (h *ConsumerPayLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	var body struct {
		AmountMinor    *int64  `json:"amount_minor"`
		Note           *string `json:"note"`
		Currency       string  `json:"currency"`
		Locked         *bool   `json:"locked"`
		ExpiresInHours *int64  `json:"expires_in_hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}

	currency := body.Currency
	if currency == "" {
		currency = "AOA"
	}
	locked := true
	if body.Locked != nil {
		locked = *body.Locked
	}

	link, err := h.core.CreateConsumerPayLink(r.Context(), service.CreateConsumerPayLinkRequest{
		ReceiverConsumerID: consumer.ID,
		AmountMinor:        body.AmountMinor,
		Note:               body.Note,
		Currency:           currency,
		Locked:             locked,
		ExpiresInHours:     body.ExpiresInHours,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create pay link")
		return
	}
	respond(w, http.StatusCreated, link)
}

// POST /v1/consumer-pay-links/:code/pay
// Authenticated — pays a consumer pay link from the consumer's wallet.
func (h *ConsumerPayLinkHandler) Pay(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	code := chi.URLParam(r, "code")

	var body struct {
		AmountMinor    *int64  `json:"amount_minor"`
		IdempotencyKey *string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}

	idempotencyKey := uuid.New().String()
	if body.IdempotencyKey != nil && *body.IdempotencyKey != "" {
		idempotencyKey = *body.IdempotencyKey
	}

	link, err := h.core.PayConsumerPayLink(r.Context(), code, service.PayConsumerPayLinkRequest{
		PayerConsumerID: consumer.ID,
		AmountMinor:     body.AmountMinor,
		IdempotencyKey:  idempotencyKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrConsumerPayLinkNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer pay link not found")
		case errors.Is(err, service.ErrConsumerPayLinkNotActive):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_NOT_ACTIVE", "link is not active")
		case errors.Is(err, service.ErrTransferInsufficientFunds):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS", "insufficient funds")
		case errors.Is(err, service.ErrTransferWalletLocked):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "ACCOUNT_FROZEN", "account is frozen")
		case errors.Is(err, service.ErrTransferSelfTransfer):
			apierror.Respond(w, r, http.StatusBadRequest, "SELF_TRANSFER_NOT_ALLOWED", "cannot pay your own link")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "payment could not be processed")
		}
		return
	}

	// Notify the link owner (recipient) via FCM — best-effort, never delays the response.
	go h.notifyPaymentRequestPaid(link, consumer.ID)

	respond(w, http.StatusOK, link)
}

// notifyPaymentRequestPaid resolves the payer's handle and sends FCM to the link owner.
func (h *ConsumerPayLinkHandler) notifyPaymentRequestPaid(link *service.ConsumerPayLink, payerConsumerID string) {
	if h.fcm == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Resolve payer handle for notification body.
	senderHandle, err := h.handles.GetHandle(ctx, payerConsumerID)
	if err != nil {
		slog.Warn("[FCM] notifyPaymentRequestPaid: could not resolve payer handle",
			"payer_consumer_id", payerConsumerID, "error", err)
		senderHandle = ""
	}

	var amountMinor int64
	if link.AmountMinor != nil {
		amountMinor = *link.AmountMinor
	}
	transferID := ""
	if link.TransferID != nil {
		transferID = *link.TransferID
	}

	slog.Info("[FCM] event created",
		"event",        "payment_request_paid",
		"recipient_id", link.ReceiverConsumerID,
		"sender",       senderHandle,
		"amount_minor", amountMinor,
	)

	h.fcm.SendPaymentRequestPaid(ctx,
		link.ReceiverConsumerID,
		senderHandle,
		amountMinor,
		link.Currency,
		transferID,
	)
}
