package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/notify"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type AcquiringHandler struct {
	svc          service.AcquiringService
	paymentLinks service.PaymentLinkService
	fcm          *notify.FCMService
	// webhookSvc lets the PAYER-side confirmation paths emit payment_link.paid.
	// Without it these paths marked a link used and told nobody — see
	// dispatchPaymentLinkPaid.
	webhookSvc service.WebhookService
}

func NewAcquiringHandler(svc service.AcquiringService, pl service.PaymentLinkService, fcm *notify.FCMService, webhookSvc service.WebhookService) *AcquiringHandler {
	return &AcquiringHandler{svc: svc, paymentLinks: pl, fcm: fcm, webhookSvc: webhookSvc}
}

// notifAmount formats an amount in minor units for a push notification body.
// e.g. 1500000 AOA → "15.000 Kz"
func notifAmount(amountMinor int64, currency string) string {
	whole := amountMinor / 100
	frac := amountMinor % 100
	symbol := currency
	if currency == "AOA" {
		symbol = "Kz"
	}
	if frac == 0 {
		return fmt.Sprintf("%d %s", whole, symbol)
	}
	return fmt.Sprintf("%d.%02d %s", whole, frac, symbol)
}

// POST /public/pay/{slug}/pay
// Initiates a Multicaixa Express payment for the given payment link.
// For open-amount links the body must contain { "amount_minor": N }.
func (h *AcquiringHandler) InitiatePay(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	link, err := h.paymentLinks.GetBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		} else {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		}
		return
	}

	if link.Status != "ACTIVE" {
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_NOT_ACTIVE", "payment link is not active")
		return
	}

	var amountMinor int64
	currency := link.Currency

	if link.AmountMinor != nil {
		amountMinor = *link.AmountMinor
	} else {
		// Open-amount link: read amount from request body.
		var body struct {
			AmountMinor int64 `json:"amount_minor"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AmountMinor <= 0 {
			apierror.Respond(w, r, http.StatusBadRequest, "MISSING_AMOUNT", "amount_minor is required for open-amount links")
			return
		}
		amountMinor = body.AmountMinor
	}

	payment, err := h.svc.InitiatePay(r.Context(), link.ID, amountMinor, currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	respond(w, http.StatusCreated, payment)
}

// POST /v1/callbacks/emis
// Receives a raw EMIS provider webhook and forwards it to the Rust core for
// HMAC validation and idempotent confirmation.  On success, marks the
// associated payment link as used.
func (h *AcquiringHandler) EmisCallback(w http.ResponseWriter, r *http.Request) {
	rawBody, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB cap
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "READ_ERROR", "could not read request body")
		return
	}
	signature := r.Header.Get("Banza-Signature")

	payment, err := h.svc.ProcessCallback(r.Context(), rawBody, signature)
	if err != nil {
		// Nothing is marked paid and no event goes out. The provider is told
		// the reason class only — core's own text (which named amounts and
		// statuses) is an internal detail, and this route is public.
		slog.Error("acquiring: callback processing failed", "error", err)
		if ce, ok := service.AsCoreError(err); ok && ce.IsClientError() {
			code := ce.Code
			if code == "" {
				code = "CALLBACK_REJECTED"
			}
			apierror.Respond(w, r, http.StatusUnprocessableEntity, code, "the callback was not accepted")
			return
		}
		// Core could not complete the settlement (it rolled back as a whole).
		// A 5xx is what makes the provider retry; a 422 here used to tell it
		// the callback was refused for good, and the payment was never settled.
		apierror.Respond(w, r, http.StatusBadGateway, "CALLBACK_NOT_PROCESSED", "the callback could not be processed — retry")
		return
	}

	// Core settled the credit, marked the link USED, paid its session and wrote
	// payment_link.paid / payment_session.paid — in one transaction (A2-07). The
	// gateway used to do the link and the event here, after core answered,
	// best-effort: a failure was logged and the provider was told 200.
	if link, lerr := h.paymentLinks.Get(r.Context(), payment.PaymentLinkID); lerr == nil {
		go h.fcm.SendPaymentToMerchant(context.Background(), link.MerchantID, "", payment.AmountMinor, payment.Currency)
	}

	respond(w, http.StatusOK, payment)
}

// POST /public/pay/{slug}/test-confirm  (simulated provider only)
// Triggers a full simulated payment confirmation for a pending acquiring payment.
func (h *AcquiringHandler) TestConfirm(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	externalRef := r.URL.Query().Get("ref")
	if externalRef == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "ref query parameter is required")
		return
	}

	link, err := h.paymentLinks.GetBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		} else {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		}
		return
	}

	// The reference must be THIS link's payment. It was not checked: a caller
	// on any public link could confirm any pending payment, and the link the
	// payment actually belonged to was the one marked paid.
	payment, err := h.svc.TestConfirm(r.Context(), externalRef, link.Currency, link.ID)
	if err != nil {
		// `ref` is caller-supplied. An unknown one is the caller's mistake, not this
		// server failing, and it answered 500 INTERNAL_ERROR with err.Error() pasted
		// into the body — the wrong class, and internal text on a public surface.
		// The block above already distinguishes not-found correctly; this one now
		// does the same, and never echoes the upstream error.
		if errors.Is(err, service.ErrNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "no pending payment for that reference")
			return
		}
		if ce, ok := service.AsCoreError(err); ok && ce.IsClientError() {
			code, msg := ce.Code, ce.Message
			if code == "" {
				code = "REJECTED"
			}
			if msg == "" {
				msg = "the confirmation was rejected"
			}
			apierror.Respond(w, r, ce.Status, code, msg)
			return
		}
		slog.ErrorContext(r.Context(), "test-confirm failed", "external_ref", externalRef, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not confirm the payment")
		return
	}

	if payment.PaymentLinkID != link.ID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "no pending payment for that reference")
		return
	}
	// Core marked the link USED and wrote payment_link.paid in the settlement's
	// transaction — the same event a real provider confirmation produces, so an
	// integration that passes in Sandbox does not go silent in Live.
	go h.fcm.SendPaymentToMerchant(context.Background(), link.MerchantID, "", payment.AmountMinor, payment.Currency)

	respond(w, http.StatusOK, payment)
}
