package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// consumerPayLinkExecutor is satisfied by *service.CorePublicClient and by test fakes.
type consumerPayLinkExecutor interface {
	GetConsumerPayLinkByCode(ctx context.Context, code string) (*service.ConsumerPayLink, error)
	CreateConsumerPayLink(ctx context.Context, req service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
	PayConsumerPayLink(ctx context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
}

// ConsumerPayLinkHandler handles consumer-facing pay link operations.
type ConsumerPayLinkHandler struct {
	core consumerPayLinkExecutor
}

func NewConsumerPayLinkHandler(core *service.CorePublicClient) *ConsumerPayLinkHandler {
	return &ConsumerPayLinkHandler{core: core}
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
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "payment could not be processed")
		}
		return
	}
	respond(w, http.StatusOK, link)
}
