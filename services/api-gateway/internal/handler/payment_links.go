package handler

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type PaymentLinkHandler struct {
	seal        bindingSealer
	svc         service.PaymentLinkService
	merchantSvc service.MerchantService
	webhookSvc  service.WebhookService
}

func NewPaymentLinkHandler(svc service.PaymentLinkService, merchantSvc service.MerchantService, webhookSvc service.WebhookService) *PaymentLinkHandler {
	return &PaymentLinkHandler{svc: svc, merchantSvc: merchantSvc, webhookSvc: webhookSvc}
}

// WithBindingSeal supplies the ADR-055 seal used when a developer key ISSUES a
// payment link. Nil leaves the handler unable to issue one for a developer key,
// which is the correct fail-closed default rather than issuing an unsealed
// artifact.
func (h *PaymentLinkHandler) WithBindingSeal(s bindingSealer) *PaymentLinkHandler {
	h.seal = s
	return h
}

// POST /v1/payment-links
// merchantPrincipalID returns the merchant id of an authenticated merchant JWT.
//
// Every payment-link operation must be bound to it. The developer-key path was
// given tenant isolation when ADR-047 introduced it; the older merchant-JWT path
// never was, so a merchant could name any merchant_id in a body or query and the
// gateway believed it. Measured on the deployed Sandbox: merchant B created a
// link payable to merchant A, read A's private record, listed A's links, and
// CANCELLED A's link — the cancellation took effect, leaving A's payment link
// dead (RA-047).
func merchantPrincipalID(r *http.Request) (string, bool) {
	p, ok := middleware.GetPrincipal(r.Context())
	if !ok || p.MerchantID == "" {
		return "", false
	}
	return p.MerchantID, true
}

// linkIDIsWellFormed rejects an id that cannot name a link, before any lookup.
//
// A malformed id is the caller's mistake, not the operator's failure. Passing it
// through reached a uuid parse in the data layer and surfaced as 500
// INTERNAL_ERROR — most easily hit by handing this route a payment-link SLUG,
// which is a natural confusion since the slug is what the public URL carries.
// Answered as not-found for the same reason a foreign link is: an id that cannot
// exist and one that does not exist are the same answer to the caller.
func linkIDIsWellFormed(w http.ResponseWriter, r *http.Request, id string) bool {
	if _, err := uuid.Parse(id); err != nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		return false
	}
	return true
}

// requireOwnedLink loads a link and confirms the caller owns it.
//
// A link belonging to someone else is reported as missing, not forbidden: 403
// would confirm the id exists and make the resource enumerable. This matches the
// privacy behaviour the payment-session surface already uses for a cross-merchant
// read, and the behaviour the developer-key path already had here.
func (h *PaymentLinkHandler) requireOwnedLink(w http.ResponseWriter, r *http.Request, id string) (*service.PaymentLink, bool) {
	if !linkIDIsWellFormed(w, r, id) {
		return nil, false
	}
	link, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return nil, false
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return nil, false
	}
	if mid, ok := merchantPrincipalID(r); ok && link.MerchantID != mid {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		return nil, false
	}
	return link, true
}

func (h *PaymentLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	// Developer-key authority (payee from the Project binding) OR merchant JWT
	// (existing body-supplied identity). Scope enforced before business logic.
	dev, handled, isDev := developerPaymentAuthorityForArtifact(w, r, "payment_links:write", h.seal)
	if handled {
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "could not read request body")
		return
	}
	// A developer request may never carry a payee — it derives ONLY from the
	// Project binding.
	if isDev && rejectClientPayeeFields(w, r, raw) {
		return
	}
	var body struct {
		MerchantID  string     `json:"merchant_id"`
		WalletID    string     `json:"wallet_id"`
		AmountMinor *int64     `json:"amount_minor"`
		Currency    string     `json:"currency"`
		Description *string    `json:"description"`
		ExpiresAt   *time.Time `json:"expires_at"`
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
			return
		}
	}

	req := service.CreatePaymentLinkRequest{
		AmountMinor: body.AmountMinor,
		Currency:    body.Currency,
		Description: body.Description,
		ExpiresAt:   body.ExpiresAt,
	}
	if isDev {
		// Payee derives exclusively from the binding.
		req.MerchantID = dev.merchantID
		req.WalletID = dev.walletID
		req.WalletAccountID = dev.walletAccountID
	} else {
		// A merchant JWT may only create links payable to ITSELF. The body value
		// used to be trusted, so any merchant could mint a link collecting into
		// another merchant's wallet under that merchant's identity (RA-047).
		mid, ok := merchantPrincipalID(r)
		if !ok {
			apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant authentication required")
			return
		}
		if body.MerchantID != "" && body.MerchantID != mid {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
				"a payment link may only be created for the authenticated merchant")
			return
		}
		req.MerchantID = mid
		req.WalletID = body.WalletID
	}

	switch {
	case req.MerchantID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "merchant_id is required")
		return
	case req.WalletID == "":
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

	link, err := h.svc.Create(r.Context(), req)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create payment link")
		return
	}
	respond(w, http.StatusCreated, link)
}

// GET /v1/payment-links
func (h *PaymentLinkHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	// A merchant JWT lists ITS OWN links. The query parameter used to select the
	// tenant, so any merchant could enumerate another merchant's links (RA-047).
	if mid, ok := merchantPrincipalID(r); ok {
		if merchantID != "" && merchantID != mid {
			apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
				"a merchant may only list its own payment links")
			return
		}
		merchantID = mid
	}
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
	// A developer key must hold payment_links:read and may only read links of its
	// bound merchant (tenant isolation) — enforced before the record is exposed.
	dev, handled, isDev := developerPaymentAuthority(w, r, "payment_links:read")
	if handled {
		return
	}
	id := chi.URLParam(r, "id")
	if !linkIDIsWellFormed(w, r, id) {
		return
	}
	link, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPaymentLinkNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment link")
		return
	}
	if isDev && link.MerchantID != dev.merchantID {
		// Cross-tenant read is indistinguishable from missing.
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		return
	}
	// The same isolation for a merchant JWT. Only the developer-key path had it,
	// so a merchant could read any link by id (RA-047).
	if mid, ok := merchantPrincipalID(r); ok && link.MerchantID != mid {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment link not found")
		return
	}
	// refund_source is a merchant-private field: surface it only to the owning
	// merchant JWT. Developer keys and non-owners never see it.
	if p, ok := middleware.GetPrincipal(r.Context()); !ok || p.MerchantID != link.MerchantID {
		link.RefundSource = nil
	}
	respond(w, http.StatusOK, link)
}

// DELETE /v1/payment-links/{id}  → cancel
func (h *PaymentLinkHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	// Ownership BEFORE mutation. This had no check at all, so any merchant could
	// cancel any other merchant's link — and it took effect, killing the victim's
	// ability to be paid through it (RA-047).
	if _, ok := h.requireOwnedLink(w, r, id); !ok {
		return
	}
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
	// Ownership BEFORE mutation, and before any webhook is dispatched: marking
	// another merchant's link as paid would emit payment_link.paid to THEIR
	// endpoints (RA-047).
	if _, ok := h.requireOwnedLink(w, r, id); !ok {
		return
	}
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

	dispatchPaymentLinkPaid(h.webhookSvc, link)

	respond(w, http.StatusOK, link)
}

// dispatchPaymentLinkPaid emits payment_link.paid to the merchant's registered
// endpoints.
//
// Every path that marks a link paid MUST go through here. This used to live
// inline in the merchant-facing MarkUsed handler only, which meant the event
// fired when a MERCHANT declared a link used but not when a PAYER actually paid
// it: the acquiring callback and the Sandbox confirm rail both mark the link
// used on the service directly. The practical effect was that the one webhook
// an integration actually depends on — "your customer paid" — never arrived,
// while a merchant-initiated mark-used did. Keeping the dispatch in one function
// is what stops that asymmetry coming back.
//
// Callers must have established authority over the link BEFORE calling this:
// emitting the event for someone else's link would deliver payment_link.paid to
// THEIR endpoints (RA-047).
//
// Fire-and-forget: the caller's response is not held up by delivery, which the
// WebhookService tracks and retries independently.
func dispatchPaymentLinkPaid(webhookSvc service.WebhookService, link *service.PaymentLink) {
	if webhookSvc == nil || link == nil {
		return
	}
	go func(l *service.PaymentLink) {
		payload, err := json.Marshal(l)
		if err != nil {
			return
		}
		_, _ = webhookSvc.Dispatch(context.Background(), service.DispatchRequest{
			MerchantID: l.MerchantID,
			EventType:  "payment_link.paid",
			Payload:    json.RawMessage(payload),
		})
	}(link)
}

// ---------------------------------------------------------------------------
// Public endpoints — no authentication required
// ---------------------------------------------------------------------------

// publicPaymentLink is the response shape for GET /public/pay/{slug}.
// It extends PaymentLink with the merchant name so the checkout page can
// show "Paying: <Merchant Name>" without a separate API call.
// publicPaymentLink is the payer-safe view of a payment link (RT03 §4). It
// exposes ONLY what an unauthenticated payer needs and never leaks internal
// database identifiers (link/merchant/wallet UUIDs), the wallet account, or the
// operator refund_source. The payer POST derives merchant/wallet from the slug
// server-side, so these ids are not needed client-side.
type publicPaymentLink struct {
	Slug         string     `json:"slug"`
	AmountMinor  *int64     `json:"amount_minor"`
	Currency     string     `json:"currency"`
	Description  *string    `json:"description"`
	Status       string     `json:"status"`
	ExpiresAt    *time.Time `json:"expires_at"`
	PaidAt       *time.Time `json:"paid_at"`
	MerchantName string     `json:"merchant_name"`
}

func toPublicPaymentLink(link *service.PaymentLink, merchantName string) publicPaymentLink {
	return publicPaymentLink{
		Slug:         link.Slug,
		AmountMinor:  link.AmountMinor,
		Currency:     link.Currency,
		Description:  link.Description,
		Status:       link.Status,
		ExpiresAt:    link.ExpiresAt,
		PaidAt:       link.PaidAt,
		MerchantName: merchantName,
	}
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

	respond(w, http.StatusOK, toPublicPaymentLink(link, merchant.Name))
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
