package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/notify"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// paymentLinkView is the public response shape — PaymentLink fields plus
// merchant_name resolved from the merchants table so consumers see the store
// name rather than a UUID.
type paymentLinkView struct {
	*service.PaymentLink
	MerchantName *string `json:"merchant_name"`
}

// PaymentLinkHandler handles consumer-facing payment link operations.
type PaymentLinkHandler struct {
	core *service.CorePublicClient
	fcm  *notify.FCMService
}

func NewPaymentLinkHandler(core *service.CorePublicClient, fcm *notify.FCMService) *PaymentLinkHandler {
	return &PaymentLinkHandler{core: core, fcm: fcm}
}

// withMerchantName enriches a PaymentLink with the merchant's display name.
// Errors are non-fatal — merchant_name will be nil rather than failing the call.
func (h *PaymentLinkHandler) withMerchantName(ctx context.Context, link *service.PaymentLink) *paymentLinkView {
	view := &paymentLinkView{PaymentLink: link}
	if m, err := h.core.GetMerchant(ctx, link.MerchantID); err == nil {
		view.MerchantName = &m.Name
	}
	return view
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

	respond(w, http.StatusOK, h.withMerchantName(r.Context(), link))
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
	transfer, err := h.core.SendTransfer(r.Context(), service.SendTransferRequest{
		IdempotencyKey: "pl-pay-" + link.ID,
		SenderID:       consumer.ID,
		RecipientID:    link.WalletID,
		// ADR-030: a Payment Session's link carries the destination segregated
		// account, so the credit lands there (e.g. a campaign account). Empty for
		// legacy links ⇒ the wallet's default account (unchanged).
		RecipientAccountID: link.WalletAccountID,
		AmountMinor:        *amountMinor,
		Currency:           link.Currency,
		Description:        "Payment link: " + slug,
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

	// Collections (BANZA ADR-036): if this payment-link is the LINK surface of a
	// CollectionShare's PaymentIntent, settle it now that the transfer is done.
	// Best-effort + idempotent; a plain link payment is a no-op.
	h.core.SettleCollectionSurface(r.Context(), "LINK", link.ID, transfer.ID)

	// Payment Session (BANZA ADR-043): if this link is the PAYMENT_LINK interface of
	// a session, mark the session PAID and emit payment_session.paid. Best-effort +
	// idempotent; a plain link payment is a no-op in core.
	h.core.SettlePaymentSessionInterface(r.Context(), "link", link.ID, transfer.ID, "PAYMENT_LINK", *amountMinor)

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

	final := link
	if updated != nil {
		final = updated
	}

	// Notify merchant via FCM — best-effort, never delays the response.
	go func(merchantID string, amount int64, currency string) {
		if h.fcm == nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		slog.Info("[FCM] event created",
			"event", "payment_link_paid",
			"merchant_id", merchantID,
			"amount_minor", amount,
		)
		h.fcm.SendPaymentLinkPaid(ctx, merchantID, amount, currency)
	}(link.MerchantID, *amountMinor, link.Currency)

	respond(w, http.StatusOK, h.withMerchantName(r.Context(), final))
}
