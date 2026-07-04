package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type PaymentLinkHandler struct {
	svc         service.PaymentLinkService
	merchantSvc service.MerchantService
	webhookSvc  service.WebhookService
}

func NewPaymentLinkHandler(svc service.PaymentLinkService, merchantSvc service.MerchantService, webhookSvc service.WebhookService) *PaymentLinkHandler {
	return &PaymentLinkHandler{svc: svc, merchantSvc: merchantSvc, webhookSvc: webhookSvc}
}

// POST /v1/payment-links
func (h *PaymentLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID  string     `json:"merchant_id"`
		WalletID    string     `json:"wallet_id"`
		AmountMinor *int64     `json:"amount_minor"`
		Currency    string     `json:"currency"`
		Description *string    `json:"description"`
		ExpiresAt   *time.Time `json:"expires_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.MerchantID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "merchant_id is required")
		return
	case body.WalletID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "wallet_id is required")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	case body.AmountMinor != nil && *body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be positive")
		return
	case body.ExpiresAt != nil && body.ExpiresAt.Before(time.Now()):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EXPIRY", "expires_at must be in the future")
		return
	}

	link, err := h.svc.Create(r.Context(), service.CreatePaymentLinkRequest{
		MerchantID:  body.MerchantID,
		WalletID:    body.WalletID,
		AmountMinor: body.AmountMinor,
		Currency:    body.Currency,
		Description: body.Description,
		ExpiresAt:   body.ExpiresAt,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create payment link")
		return
	}
	respond(w, http.StatusCreated, link)
}

// GET /v1/payment-links
func (h *PaymentLinkHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "merchant_id query parameter is required")
		return
	}
	limit := int64(20)
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.ParseInt(l, 10, 64); err == nil && v > 0 {
			limit = v
		}
	}
	page, err := h.svc.List(r.Context(), service.ListPaymentLinksRequest{
		MerchantID: merchantID,
		Limit:      limit,
		Cursor:     r.URL.Query().Get("cursor"),
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list payment links")
		return
	}
	respond(w, http.StatusOK, page)
}

// GET /v1/payment-links/{id}
func (h *PaymentLinkHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	link, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}
	// refund_source is a merchant-private field: surface it only to the owning
	// merchant. A non-owner (or an unauthenticated caller) never sees it.
	if p, ok := middleware.GetPrincipal(r.Context()); !ok || p.MerchantID != link.MerchantID {
		link.RefundSource = nil
	}
	respond(w, http.StatusOK, link)
}

// DELETE /v1/payment-links/{id}  → cancel
func (h *PaymentLinkHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	link, err := h.svc.Cancel(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPaymentLinkNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		case errors.Is(err, service.ErrPaymentLinkNotActive):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_NOT_ACTIVE", "payment link is not active")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not cancel payment link")
		}
		return
	}
	respond(w, http.StatusOK, link)
}

// POST /v1/payment-links/{id}/mark-used  (called by mobile app after payment)
func (h *PaymentLinkHandler) MarkUsed(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	link, err := h.svc.MarkUsed(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPaymentLinkNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		case errors.Is(err, service.ErrPaymentLinkNotActive):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_NOT_ACTIVE", "payment link is not active")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not mark payment link as used")
		}
		return
	}

	// Dispatch payment_link.paid to the merchant's registered webhook endpoints.
	// Fire-and-forget: the response goes to the caller immediately; webhook
	// delivery is tracked and retried independently by the WebhookService.
	go func(l *service.PaymentLink) {
		payload, err := json.Marshal(l)
		if err != nil {
			return
		}
		_, _ = h.webhookSvc.Dispatch(context.Background(), service.DispatchRequest{
			MerchantID: l.MerchantID,
			EventType:  "payment_link.paid",
			Payload:    json.RawMessage(payload),
		})
	}(link)

	respond(w, http.StatusOK, link)
}

// ---------------------------------------------------------------------------
// Public endpoints — no authentication required
// ---------------------------------------------------------------------------

// publicPaymentLink is the response shape for GET /public/pay/{slug}.
// It extends PaymentLink with the merchant name so the checkout page can
// show "Paying: <Merchant Name>" without a separate API call.
type publicPaymentLink struct {
	*service.PaymentLink
	MerchantName string `json:"merchant_name"`
}

// GET /public/pay/{slug}
func (h *PaymentLinkHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	link, err := h.svc.GetBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}

	merchant, err := h.merchantSvc.Get(r.Context(), link.MerchantID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch merchant")
		return
	}

	respond(w, http.StatusOK, publicPaymentLink{PaymentLink: link, MerchantName: merchant.Name})
}

// GET /public/pay/{slug}/status
func (h *PaymentLinkHandler) Status(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	link, err := h.svc.GetBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}
	paid := link.Status == "USED"
	respond(w, http.StatusOK, map[string]bool{"paid": paid})
}
