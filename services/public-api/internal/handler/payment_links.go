package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// PaymentLinkHandler handles consumer-facing payment link operations.
type PaymentLinkHandler struct {
	core *service.CorePublicClient
}

func NewPaymentLinkHandler(core *service.CorePublicClient) *PaymentLinkHandler {
	return &PaymentLinkHandler{core: core}
}

// GET /v1/payment-links/{slug}
// Public endpoint — no authentication required.
// Returns enough info for a consumer to decide whether to pay.
func (h *PaymentLinkHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	link, err := h.core.GetPaymentLinkBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}

	respond(w, http.StatusOK, link)
}

// POST /v1/payment-links/{slug}/pay
// Authenticated — the consumer pays the amount on the link from their wallet.
// The amount is deducted from the consumer's wallet and credited to the merchant.
func (h *PaymentLinkHandler) Pay(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	slug := chi.URLParam(r, "slug")

	link, err := h.core.GetPaymentLinkBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}

	if link.Status != "ACTIVE" {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_NOT_ACTIVE",
			"payment link is "+link.Status)
		return
	}

	// For open links (no fixed amount), the consumer supplies the amount.
	amountMinor := link.AmountMinor
	if amountMinor == nil {
		var body struct {
			AmountMinor int64 `json:"amount_minor"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AmountMinor <= 0 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT",
				"amount_minor is required for open payment links")
			return
		}
		amountMinor = &body.AmountMinor
	}

	// Verify the consumer has a wallet for this currency before attempting the transfer.
	_, err = h.core.GetWalletForConsumer(r.Context(), consumer.ID, link.Currency)
	if err != nil {
		if errors.Is(err, service.ErrConsumerWalletNotFound) {
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "NO_WALLET",
				"you have no wallet in "+link.Currency+" — create one first via GET /v1/me/wallet")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not resolve wallet")
		return
	}

	// Execute: debit consumer wallet → credit merchant wallet, then mark link used.
	// SenderID must be the consumer's UUID (not the wallet UUID) — the transfer engine
	// resolves the wallet internally via consumer_id. RecipientID is the merchant's
	// wallet UUID; the engine falls back to the `wallets` table when the recipient is
	// not found in consumer_wallets.
	_, err = h.core.SendTransfer(r.Context(), service.SendTransferRequest{
		IdempotencyKey: "pl-pay-" + link.ID,
		SenderID:       consumer.ID,
		RecipientID:    link.WalletID,
		AmountMinor:    *amountMinor,
		Currency:       link.Currency,
		Description:    "Payment link: " + slug,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferInsufficientFunds):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS", "insufficient funds")
		case errors.Is(err, service.ErrTransferWalletNotFound):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "WALLET_NOT_FOUND",
				"merchant wallet is inactive or not found")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "payment could not be processed")
		}
		return
	}

	// Mark the link as used — idempotent if the transfer already occurred.
	updated, err := h.core.MarkPaymentLinkUsed(r.Context(), link.ID)
	if err != nil {
		// Transfer succeeded but mark-used failed; the link will be reconciled
		// by the expiry worker. We still return success to the consumer.
		if !errors.Is(err, service.ErrPaymentLinkNotActive) {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
				"payment processed but link status could not be updated")
			return
		}
	}

	if updated != nil {
		respond(w, http.StatusOK, updated)
	} else {
		respond(w, http.StatusOK, link)
	}
}
