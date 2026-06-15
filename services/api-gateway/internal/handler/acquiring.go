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
}

func NewAcquiringHandler(svc service.AcquiringService, pl service.PaymentLinkService, fcm *notify.FCMService) *AcquiringHandler {
	return &AcquiringHandler{svc: svc, paymentLinks: pl, fcm: fcm}
}

// notifAmount formats an amount in minor units for a push notification body.
// e.g. 1500000 AOA → "15.000 Kz"
func notifAmount(amountMinor int64, currency string) string {
	whole := amountMinor / 100
	frac  := amountMinor % 100
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
		slog.Error("acquiring: callback processing failed", "error", err)
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "CALLBACK_ERROR", err.Error())
		return
	}

	// Mark the payment link as used so it can no longer accept new payments.
	// This is best-effort: the payment is already confirmed in the acquiring
	// ledger; reconciliation will catch any inconsistency.
	if link, mlErr := h.paymentLinks.MarkUsed(r.Context(), payment.PaymentLinkID); mlErr != nil {
		slog.Error("acquiring: failed to mark payment link used",
			"payment_link_id", payment.PaymentLinkID,
			"error", mlErr,
		)
	} else {
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

	payment, err := h.svc.TestConfirm(r.Context(), externalRef, link.Currency)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if _, mlErr := h.paymentLinks.MarkUsed(r.Context(), payment.PaymentLinkID); mlErr != nil {
		slog.Error("test-confirm: failed to mark payment link used",
			"payment_link_id", payment.PaymentLinkID,
			"error", mlErr,
		)
	}

	go h.fcm.SendPaymentToMerchant(context.Background(), link.MerchantID, "", payment.AmountMinor, payment.Currency)

	respond(w, http.StatusOK, payment)
}
