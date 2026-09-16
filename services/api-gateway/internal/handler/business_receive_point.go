package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// BusinessReceivePointHandler exposes the Business Receive Point (ADR-065) across
// its three surfaces, all backed by ONE operator-local service:
//
//   - Owner (merchant JWT): read/provision the stable receive identity and render
//     its canonical printable QR. The QR is persistent.
//   - Public (no auth, rate-limited): resolve a scanned slug to the payer-safe
//     Business identity. The server re-derives the Business and re-checks
//     eligibility; the client never chooses the destination.
//   - Internal (service secret, public-api): mint a FRESH Payment Session for a
//     payer. The session is not persistent.
//
// Core sees only a generic Payment Session — nothing receive-point-specific.
type BusinessReceivePointHandler struct {
	svc       receivePointService
	sessions  service.PaymentSessionService
	merchants merchantLookup
	env       string
	payBase   string
}

// receivePointService is the operator-local receive-point capability the handler
// needs. *service.BusinessReceivePointService satisfies it; tests supply a fake.
type receivePointService interface {
	EnsureActive(ctx context.Context, merchantID, environment string) (*service.ReceivePoint, error)
	ResolveForPayment(ctx context.Context, slug string) (*service.ReceivePointPublic, string, error)
	MintSession(ctx context.Context, sessions service.PaymentSessionService, payerID, slug, idempotencyKey string, amountMinor int64) (*service.PaymentSession, error)
	Disable(ctx context.Context, merchantID, environment string) error
}

func NewBusinessReceivePointHandler(svc receivePointService, sessions service.PaymentSessionService, merchants merchantLookup, environment, payBase string) *BusinessReceivePointHandler {
	return &BusinessReceivePointHandler{
		svc:       svc,
		sessions:  sessions,
		merchants: merchants,
		env:       strings.ToUpper(strings.TrimSpace(environment)),
		payBase:   strings.TrimRight(payBase, "/"),
	}
}

// payURL is the camera-scannable web address the printed QR encodes: a plain phone
// camera opens the hosted page; the Banzami app intercepts the same universal link
// (pay.banzami.com/b/{slug}). With no payBase configured it keeps the request-host
// shape rather than inventing an origin.
func (h *BusinessReceivePointHandler) payURL(r *http.Request, slug string) string {
	if h.payBase != "" {
		return h.payBase + "/b/" + slug
	}
	scheme := "https"
	if r.TLS == nil && (strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.0.0.1")) {
		scheme = "http"
	}
	return scheme + "://" + r.Host + "/public/b/" + slug
}

// ownerActiveMerchant returns the authenticated, ACTIVE merchant, or writes the
// refusal and returns ok=false. A receive point is only provisioned for a Business
// that could receive.
func (h *BusinessReceivePointHandler) ownerActiveMerchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return "", false
	}
	if m, err := h.merchants.Get(r.Context(), principal.MerchantID); err != nil || m == nil || m.Status != service.MerchantStatusActive {
		apierror.Respond(w, r, http.StatusForbidden, "MERCHANT_NOT_ACTIVE", "business is not permitted to receive payments")
		return "", false
	}
	return principal.MerchantID, true
}

// ownerDTO is what the Business sees: the stable slug and the canonical artifact
// addresses to print. Never a wallet/account/binding id.
func (h *BusinessReceivePointHandler) ownerDTO(r *http.Request, rp *service.ReceivePoint) map[string]any {
	return map[string]any{
		"slug":        rp.PublicSlug,
		"status":      rp.Status,
		"environment": rp.Environment,
		"deep_link":   "banzami://pay/business/" + rp.PublicSlug,
		"pay_url":     h.payURL(r, rp.PublicSlug),
		"qr_url":      "/v1/business/receive-point/qr",
	}
}

// GET /v1/business/receive-point — the Business reads (provisioning on first read)
// its one ACTIVE receive identity for this environment.
func (h *BusinessReceivePointHandler) Mine(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.ownerActiveMerchant(w, r)
	if !ok {
		return
	}
	rp, err := h.svc.EnsureActive(r.Context(), merchantID, h.env)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "RECEIVE_POINT_UNAVAILABLE", "could not read the receive point")
		return
	}
	respond(w, http.StatusOK, h.ownerDTO(r, rp))
}

// GET /v1/business/receive-point/qr?format=svg|png|pdf — the printable canonical QR
// for the Business's stable receive identity. Without a format it returns the
// encodable value as JSON.
func (h *BusinessReceivePointHandler) Qr(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.ownerActiveMerchant(w, r)
	if !ok {
		return
	}
	rp, err := h.svc.EnsureActive(r.Context(), merchantID, h.env)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "RECEIVE_POINT_UNAVAILABLE", "could not read the receive point")
		return
	}
	value := h.payURL(r, rp.PublicSlug)
	format := strings.ToLower(r.URL.Query().Get("format"))
	if renderQR(w, r, value, format) {
		return
	}
	respond(w, http.StatusOK, map[string]any{"type": "QR", "value": value})
}

// POST /v1/business/receive-point/disable — retire the Business's active receive
// identity. After this the printed QR fails closed on resolve. Zero ledger effect.
func (h *BusinessReceivePointHandler) Disable(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.ownerActiveMerchant(w, r)
	if !ok {
		return
	}
	if err := h.svc.Disable(r.Context(), merchantID, h.env); err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "RECEIVE_POINT_UNAVAILABLE", "could not disable the receive point")
		return
	}
	respond(w, http.StatusOK, map[string]any{"status": "DISABLED"})
}

// GET /v1/receive-points/{slug} — PUBLIC resolution of a scanned receive point to
// the payer-safe Business identity. Server-resolved and fail-closed: a disabled
// point or an ineligible Business is refused, never silently payable.
func (h *BusinessReceivePointHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	pub, _, err := h.svc.ResolveForPayment(r.Context(), slug)
	if err != nil {
		h.respondReceivePointError(w, r, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{
		"slug":         pub.Slug,
		"display_name": pub.DisplayName,
		"handle":       pub.Handle,
		"currency":     pub.Currency,
		"status":       pub.Status,
		"environment":  pub.Environment,
	})
}

// POST /internal/v1/receive-points/{slug}/sessions — INTERNAL mint. public-api (the
// consumer surface) supplies the authenticated payer; this endpoint trusts the
// service credential for that identity and never takes a payer from an end client.
// The payee is server-resolved from the slug; the caller supplies only amount + key.
func (h *BusinessReceivePointHandler) Mint(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "could not read request body")
		return
	}
	var body struct {
		PayerID        string `json:"payer_id"`
		AmountMinor    *int64 `json:"amount_minor"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if strings.TrimSpace(body.PayerID) == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payer_id is required")
		return
	}
	if body.AmountMinor == nil || *body.AmountMinor <= 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	}
	sess, err := h.svc.MintSession(r.Context(), h.sessions, body.PayerID, slug, body.IdempotencyKey, *body.AmountMinor)
	if err != nil {
		h.respondMintError(w, r, err)
		return
	}
	respond(w, http.StatusCreated, h.sessionDTO(r, sess))
}

// sessionDTO is the compact minted-session view handed back to public-api, which
// reshapes it for the consumer. It carries what is needed to pay: the session id
// and the hosted pay interface. Never a ledger/account id.
func (h *BusinessReceivePointHandler) sessionDTO(r *http.Request, s *service.PaymentSession) map[string]any {
	dto := map[string]any{
		"session_id":   s.SessionID,
		"amount_minor": s.AmountMinor,
		"currency":     s.Currency,
		"status":       s.Status,
		"expires_at":   s.ExpiresAt,
	}
	if s.PaymentLinkSlug != nil && *s.PaymentLinkSlug != "" {
		dto["pay_url"] = h.payURLForLink(r, *s.PaymentLinkSlug)
		dto["payment_link_slug"] = *s.PaymentLinkSlug
	}
	return dto
}

// payURLForLink builds the hosted pay address for a minted session's payment link
// (pay.banzami.com/pay/{slug}) — the same surface every session uses.
func (h *BusinessReceivePointHandler) payURLForLink(r *http.Request, slug string) string {
	if h.payBase != "" {
		return h.payBase + "/pay/" + slug
	}
	scheme := "https"
	if r.TLS == nil && (strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.0.0.1")) {
		scheme = "http"
	}
	return scheme + "://" + r.Host + "/public/pay/" + slug
}

// respondReceivePointError maps the resolution failures to their contract status.
func (h *BusinessReceivePointHandler) respondReceivePointError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrReceivePointNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "RECEIVE_POINT_NOT_FOUND", "receive point not found")
	case errors.Is(err, service.ErrReceivePointDisabled):
		apierror.Respond(w, r, http.StatusConflict, "RECEIVE_POINT_DISABLED", "this receive point is no longer active")
	case errors.Is(err, service.ErrReceivePointIneligible):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "BUSINESS_CANNOT_RECEIVE", "this business cannot receive payments right now")
	default:
		respondCoreError(w, r, err, "could not resolve the receive point")
	}
}

// respondMintError adds the idempotency-contract statuses on top of resolution.
func (h *BusinessReceivePointHandler) respondMintError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrMintKeyRequired):
		apierror.Respond(w, r, http.StatusBadRequest, "IDEMPOTENCY_KEY_REQUIRED", "idempotency key is required")
	case errors.Is(err, service.ErrMintKeyTooLong):
		apierror.Respond(w, r, http.StatusBadRequest, "IDEMPOTENCY_KEY_TOO_LONG", "idempotency key is too long")
	case errors.Is(err, service.ErrIdempotencyConflict):
		apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "this idempotency key was used for a different payment")
	case errors.Is(err, service.ErrMintPending):
		w.Header().Set("Retry-After", "1")
		apierror.Respond(w, r, http.StatusConflict, "MINT_IN_PROGRESS", "a payment for this key is in progress; retry")
	default:
		h.respondReceivePointError(w, r, err)
	}
}
