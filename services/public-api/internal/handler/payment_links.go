package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	documents "github.com/banzami/banzami/services/common/documents"
	banzamienv "github.com/banzami/banzami/services/common/env"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/notify"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// paymentLinkView is the public response shape — PaymentLink fields plus the
// payee a payer is about to pay, named as every receipt will name it.
type paymentLinkView struct {
	*service.PaymentLink
	// The link's internal ids stay inside: the payer pays by slug, and for a
	// Business's campaign links the account id named the campaign's ledger
	// account to anyone with the link (A6-07). These share the embedded fields'
	// JSON names, win as the shallower field, and stay nil — so the key is omitted.
	ID              *struct{} `json:"id,omitempty"`
	MerchantID      *struct{} `json:"merchant_id,omitempty"`
	WalletID        *struct{} `json:"wallet_id,omitempty"`
	WalletAccountID *struct{} `json:"wallet_account_id,omitempty"`
	// MerchantName / MerchantHandle are the Business's PUBLIC identity (the name
	// it presents and the @handle it owns). They used to be the Business's
	// account name, which for a Business created by the retired Console setup
	// was "Sandbox · <Project name>" — a Project is never the payee.
	MerchantName   *string `json:"merchant_name"`
	MerchantHandle *string `json:"merchant_handle,omitempty"`
	// TransactionID is the resulting transfer's id, set only on the pay response.
	// The receipt endpoint keys on the transaction id (not the link id), so the
	// client needs it to fetch the comprovativo. Nil on GET (no transfer yet).
	TransactionID *string `json:"transaction_id,omitempty"`
	// Receipt is the canonical receipt of the payment, set only on the pay
	// response when its proof was established — the phone's comprovativo shows
	// exactly this. Absent ⇒ the app asks GET /v1/consumer/transactions/{id}/receipt.
	Receipt *documents.Receipt `json:"receipt,omitempty"`
}

// linkReceipts is what the link handler needs from the gateway.
type linkReceipts interface {
	ReceiptIssuer
	BusinessIdentity(ctx context.Context, merchantID string) (service.BusinessIdentity, error)
}

// PaymentLinkHandler handles consumer-facing payment link operations.
type PaymentLinkHandler struct {
	core     *service.CorePublicClient
	fcm      *notify.FCMService
	receipts linkReceipts
	env      string
}

func NewPaymentLinkHandler(core *service.CorePublicClient, fcm *notify.FCMService, proofs *service.ProofClient, environment string) *PaymentLinkHandler {
	h := &PaymentLinkHandler{core: core, fcm: fcm, env: banzamienv.Parse(environment).String()}
	if proofs != nil { // a nil *ProofClient in an interface is not nil
		h.receipts = proofs
	}
	return h
}

// withMerchantName enriches a PaymentLink with the payee's public identity.
// Errors are non-fatal — merchant_name is nil rather than failing the call, and
// never falls back to the account name.
func (h *PaymentLinkHandler) withMerchantName(ctx context.Context, link *service.PaymentLink) *paymentLinkView {
	view := &paymentLinkView{PaymentLink: link}
	if h.receipts == nil {
		return view
	}
	if b, err := h.receipts.BusinessIdentity(ctx, link.MerchantID); err == nil {
		view.MerchantName = &b.DisplayName
		if b.Handle != "" {
			view.MerchantHandle = &b.Handle
		}
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
		// What the Business wrote on the link, or nothing. This used to be
		// "Payment link: <slug>" — an internal id the payer then read as the
		// payment's description on their receipt.
		Description: linkDescription(link),
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferKeyReused):
			apierror.Respond(w, r, http.StatusConflict, "LINK_ALREADY_PAID", "this payment link has already been paid")
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

	// Collections (BANZA ADR-016): if this payment-link is the LINK surface of a
	// CollectionShare's PaymentIntent, settle it now that the transfer is done.
	// Best-effort + idempotent; a plain link payment is a no-op.
	h.core.SettleCollectionSurface(r.Context(), "LINK", link.ID, transfer.ID)

	// Complete the payment: core claims the link, records the refundable wallet
	// payment and — if the link belongs to a Payment Session — pays the session
	// with its payment_session.paid event, all in one transaction (A2-06). The
	// session used to be settled by a separate best-effort call whose failure
	// nobody saw and nothing retried.
	updated, err := h.core.MarkPaymentLinkUsed(r.Context(), link.ID, transfer.ID)
	if err != nil && !errors.Is(err, service.ErrPaymentLinkNotActive) {
		// The transfer is committed and the completion rolled back as a whole.
		// Retrying this call replays the same transfer (its key names the link)
		// and completes the payment; nothing is taken twice.
		slog.ErrorContext(r.Context(), "payment_link.completion_failed",
			"payment_link_id", link.ID, "transfer_id", transfer.ID, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "PAYMENT_NOT_CONFIRMED",
			"the payment was taken but not yet confirmed — retry to complete it; you will not be charged twice")
		return
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

	view := h.withMerchantName(r.Context(), final)
	view.TransactionID = &transfer.ID // so the client can fetch the receipt by transaction id

	// The payment's proof is established now, at completion, so the payer's
	// comprovativo shows the one reference the PDF and the verifier will show.
	// Best-effort and bounded: the payment has already happened, and the app
	// asks again (GET …/receipt) when this is absent.
	if h.receipts != nil {
		rctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		if rec, err := h.receipts.TransferReceipt(rctx, transfer.ID, h.env, true); err == nil && rec.ProofReference != "" {
			view.Receipt = &rec
		} else if err != nil {
			slog.WarnContext(r.Context(), "payment_link.receipt_deferred", "transfer_id", transfer.ID, "error", err)
		}
		cancel()
	}
	respond(w, http.StatusOK, view)
}

func linkDescription(link *service.PaymentLink) string {
	if link.Description == nil {
		return ""
	}
	return *link.Description
}
