package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// PaymentSessionHandler is the app-facing surface for Payment Sessions (ADR-043).
// A Business Account creates a session bound to a wallet_account it owns and gets
// back the interfaces (link + QR + deep link) that all credit that account. The
// app displays them; it never generates a financial payload and never sees a
// ledger account id.
type PaymentSessionHandler struct {
	sessions  service.PaymentSessionService
	merchants merchantLookup
}

func NewPaymentSessionHandler(s service.PaymentSessionService, m merchantLookup) *PaymentSessionHandler {
	return &PaymentSessionHandler{sessions: s, merchants: m}
}

// publicURL builds the hosted pay URL for a link slug from the request host (the
// gateway serves both /v1/business and /public/pay).
func publicURL(r *http.Request, slug string) string {
	scheme := "https"
	if r.TLS == nil && (strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.0.0.1")) {
		scheme = "http"
	}
	return scheme + "://" + r.Host + "/public/pay/" + slug
}

// safeDTO shapes the session for the app per the canonical ADR-043 schema:
// interfaces is an ARRAY of {type, value, format, expires_at, status}; never a
// ledger/account id. Every interface resolves to the same session + destination.
func (h *PaymentSessionHandler) safeDTO(r *http.Request, s *service.PaymentSession) map[string]any {
	qrURL := "/v1/business/payment-sessions/" + s.SessionID + "/qr"
	interfaces := []map[string]any{}
	if s.PaymentLinkSlug != nil && *s.PaymentLinkSlug != "" {
		interfaces = append(interfaces,
			map[string]any{"type": "PAYMENT_LINK", "value": publicURL(r, *s.PaymentLinkSlug), "format": "URL", "expires_at": s.ExpiresAt},
			map[string]any{"type": "DEEP_LINK", "value": "banzami://pay/" + *s.PaymentLinkSlug, "format": "URL", "expires_at": s.ExpiresAt},
		)
	}
	if s.QrPayload != nil && *s.QrPayload != "" {
		// Fixed-amount session: a dynamic QR carrying the signed payload.
		interfaces = append(interfaces, map[string]any{
			"type": "DYNAMIC_QR", "value": *s.QrPayload, "format": "QR_PAYLOAD",
			"qr_url": qrURL, "expires_at": s.ExpiresAt,
		})
	} else if s.PaymentLinkSlug != nil && *s.PaymentLinkSlug != "" {
		// Open-amount session: a static QR rendering the link URL.
		interfaces = append(interfaces, map[string]any{
			"type": "STATIC_QR", "value": publicURL(r, *s.PaymentLinkSlug), "format": "QR_PAYLOAD",
			"qr_url": qrURL, "expires_at": s.ExpiresAt,
		})
	}
	return map[string]any{
		"session_id":        s.SessionID,
		"wallet_account_id": s.WalletAccountID,
		"currency":          s.Currency,
		"amount_minor":      s.AmountMinor,
		"purpose":           s.Purpose,
		"reference_type":    s.ReferenceType,
		"reference_id":      s.ReferenceID,
		"status":            s.Status,
		"expires_at":        s.ExpiresAt,
		"created_at":        s.CreatedAt,
		"interfaces":        interfaces,
	}
}

func (h *PaymentSessionHandler) authedActiveMerchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return "", false
	}
	if m, err := h.merchants.Get(r.Context(), principal.MerchantID); err != nil || m == nil || m.Status != service.MerchantStatusActive {
		apierror.Respond(w, r, http.StatusForbidden, "MERCHANT_NOT_ACTIVE", "merchant is not permitted to create payment sessions")
		return "", false
	}
	return principal.MerchantID, true
}

// POST /v1/business/payment-sessions
func (h *PaymentSessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.authedActiveMerchant(w, r)
	if !ok {
		return
	}
	var body struct {
		WalletAccountID string         `json:"wallet_account_id"`
		Purpose         string         `json:"purpose"`
		ReferenceType   string         `json:"reference_type"`
		ReferenceID     string         `json:"reference_id"`
		AmountMinor     *int64         `json:"amount_minor"`
		Currency        string         `json:"currency"`
		Description     string         `json:"description"`
		ExpiresAt       *string        `json:"expires_at"`
		Metadata        map[string]any `json:"metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.WalletAccountID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "wallet_account_id is required")
		return
	}
	// Core re-validates that the wallet_account is owned by this merchant + ACTIVE.
	sess, err := h.sessions.Create(r.Context(), service.CreatePaymentSessionInput{
		MerchantID:      merchantID,
		WalletAccountID: body.WalletAccountID,
		Purpose:         body.Purpose,
		ReferenceType:   body.ReferenceType,
		ReferenceID:     body.ReferenceID,
		AmountMinor:     body.AmountMinor,
		Currency:        body.Currency,
		Description:     body.Description,
		ExpiresAt:       body.ExpiresAt,
		Metadata:        body.Metadata,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not create payment session")
		return
	}
	respond(w, http.StatusCreated, h.safeDTO(r, sess))
}

// GET /v1/business/payment-sessions?status=&limit=
func (h *PaymentSessionHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.authedActiveMerchant(w, r)
	if !ok {
		return
	}
	status := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status")))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	sessions, err := h.sessions.List(r.Context(), merchantID, status, limit)
	if err != nil {
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "could not list payment sessions")
		return
	}
	out := make([]map[string]any, 0, len(sessions))
	for i := range sessions {
		out = append(out, h.safeDTO(r, &sessions[i]))
	}
	respond(w, http.StatusOK, map[string]any{"data": out})
}

func (h *PaymentSessionHandler) load(w http.ResponseWriter, r *http.Request) (*service.PaymentSession, bool) {
	merchantID, ok := h.authedActiveMerchant(w, r)
	if !ok {
		return nil, false
	}
	sess, err := h.sessions.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil || sess == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment session not found")
		return nil, false
	}
	if sess.MerchantID != merchantID {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment session not found")
		return nil, false
	}
	return sess, true
}

// GET /v1/business/payment-sessions/{id}
func (h *PaymentSessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	sess, ok := h.load(w, r)
	if !ok {
		return
	}
	respond(w, http.StatusOK, h.safeDTO(r, sess))
}

// GET /v1/business/payment-sessions/{id}/link
func (h *PaymentSessionHandler) Link(w http.ResponseWriter, r *http.Request) {
	sess, ok := h.load(w, r)
	if !ok {
		return
	}
	if sess.PaymentLinkSlug == nil || *sess.PaymentLinkSlug == "" {
		apierror.Respond(w, r, http.StatusNotFound, "NO_LINK", "session has no payment link")
		return
	}
	respond(w, http.StatusOK, map[string]any{
		"type": "PAYMENT_LINK",
		"slug": *sess.PaymentLinkSlug,
		"url":  publicURL(r, *sess.PaymentLinkSlug),
	})
}

// GET /v1/business/payment-sessions/{id}/qr?format=png|svg|pdf
// The QR encodes the dynamic-QR payload when present (fixed amount), else the
// session's public pay URL (open amount). The image is rendered server-side (U4);
// without a format it returns the encodable value as JSON.
func (h *PaymentSessionHandler) Qr(w http.ResponseWriter, r *http.Request) {
	sess, ok := h.load(w, r)
	if !ok {
		return
	}
	value := ""
	if sess.QrPayload != nil && *sess.QrPayload != "" {
		value = *sess.QrPayload
	} else if sess.PaymentLinkSlug != nil && *sess.PaymentLinkSlug != "" {
		value = publicURL(r, *sess.PaymentLinkSlug)
	}
	if value == "" {
		apierror.Respond(w, r, http.StatusNotFound, "NO_QR", "session has no QR interface")
		return
	}
	format := strings.ToLower(r.URL.Query().Get("format"))
	if renderQR(w, r, value, format) {
		return
	}
	respond(w, http.StatusOK, map[string]any{"type": "QR", "value": value})
}
