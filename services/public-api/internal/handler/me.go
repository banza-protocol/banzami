package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// MeHandler handles the authenticated consumer's profile and wallet endpoints.
type MeHandler struct {
	core        *service.CorePublicClient
	environment string // "PRODUCTION" or "SANDBOX"
}

func NewMeHandler(core *service.CorePublicClient, environment string) *MeHandler {
	return &MeHandler{core: core, environment: environment}
}

// GET /v1/me
func (h *MeHandler) Profile(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	record, err := h.core.GetConsumer(r.Context(), consumer.ID)
	if err != nil {
		if errors.Is(err, service.ErrConsumerNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "consumer not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch profile")
		return
	}

	// Merge environment into the consumer map so SDK callers don't need
	// structural changes — environment is additive alongside existing fields.
	out := map[string]any{"environment": h.environment}
	if b, err2 := json.Marshal(record); err2 == nil {
		_ = json.Unmarshal(b, &out)
	}
	respond(w, http.StatusOK, out)
}

// GET /v1/me/wallet
// Returns the consumer's primary AOA wallet, creating it if it does not exist.
func (h *MeHandler) Wallet(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "AOA"
	}

	wallet, err := h.core.GetOrCreateWallet(r.Context(), consumer.ID, currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch wallet")
		return
	}

	respond(w, http.StatusOK, wallet)
}

// GET /v1/me/wallet/balance
func (h *MeHandler) Balance(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "AOA"
	}

	wallet, err := h.core.GetWalletForConsumer(r.Context(), consumer.ID, currency)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NO_WALLET",
				"no wallet for this currency — call GET /v1/me/wallet to create one")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch wallet")
		return
	}

	balance, err := h.core.GetWalletBalance(r.Context(), wallet.ID)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "wallet not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not compute balance")
		return
	}

	respond(w, http.StatusOK, balance)
}
