package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type ConsumerWalletHandler struct {
	svc service.ConsumerWalletService
}

func NewConsumerWalletHandler(svc service.ConsumerWalletService) *ConsumerWalletHandler {
	return &ConsumerWalletHandler{svc: svc}
}

// POST /v1/consumer-wallets
// Body: {"consumer_id": "...", "currency": "AOA"}
// Idempotent — returns existing wallet if one already exists for the pair.
func (h *ConsumerWalletHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ConsumerID string `json:"consumer_id"`
		Currency   string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.ConsumerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "consumer_id is required")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	}

	wallet, err := h.svc.GetOrCreate(r.Context(), body.ConsumerID, body.Currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not provision wallet")
		return
	}
	respond(w, http.StatusCreated, wallet)
}

// GET /v1/consumer-wallets/{id}
func (h *ConsumerWalletHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wallet, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch wallet")
		return
	}
	respond(w, http.StatusOK, wallet)
}

// GET /v1/consumer-wallets/{id}/balance
func (h *ConsumerWalletHandler) Balance(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bal, err := h.svc.Balance(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not retrieve balance")
		return
	}
	respond(w, http.StatusOK, bal)
}

// GET /v1/consumer-wallets?consumer_id=X&currency=AOA
func (h *ConsumerWalletHandler) GetForConsumer(w http.ResponseWriter, r *http.Request) {
	consumerID := r.URL.Query().Get("consumer_id")
	currency := r.URL.Query().Get("currency")
	if consumerID == "" || currency == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "consumer_id and currency are required query parameters")
		return
	}

	wallet, err := h.svc.GetForConsumer(r.Context(), consumerID, currency)
	if err != nil {
		if errors.Is(err, service.ErrNoWalletForConsumer) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "no wallet for consumer in that currency")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch wallet")
		return
	}
	respond(w, http.StatusOK, wallet)
}
