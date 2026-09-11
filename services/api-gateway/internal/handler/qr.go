package handler

import (
	"cmp"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type QrHandler struct {
	svc service.QrService
}

func NewQrHandler(svc service.QrService) *QrHandler {
	return &QrHandler{svc: svc}
}

// POST /v1/qr/static
// Body: {"owner_id":"...","owner_type":"CONSUMER"|"MERCHANT","currency":"AOA"}

// requireOwnQrOwner binds a MERCHANT-owned QR to the authenticated merchant.
//
// owner_id arrived from the request body and was trusted, so merchant B could
// create a QR owned by merchant A — a payment instrument collecting into A's
// wallet, with an amount and reference chosen by B, presented under A's identity.
// Measured on the deployed Sandbox: B naming A returned 201 (RA-049). This is the
// RA-047 shape on a third surface, and the third time a client-supplied ownership
// identifier has been trusted on this API.
//
// This surface is the merchant surface: every caller is a Business (merchant
// JWT) or a Project acting for its bound Business. Neither is authority over a
// consumer's QR. The CONSUMER branch used to pass unchecked — so a Business
// could mint a QR owned by any consumer id it named. A consumer's QR is made
// on the consumer surface (public-api), under the consumer's own token.
// qrDefaults fills what a Business QR request may leave out. This surface
// accepts one owner type — MERCHANT, the authenticated Business itself (see
// requireOwnQrOwner) — and the operator settles in Kwanza, so neither is a
// choice. @banzami/sdk's createStaticQr and createDynamicQr never sent
// owner_type (nor, for static, currency), and every call was refused as
// "owner_type is required". An explicit value is still checked as before.
func qrDefaults(ownerType, currency string) (string, string) {
	if ownerType == "" {
		ownerType = "MERCHANT"
	}
	if currency == "" {
		currency = "AOA"
	}
	return ownerType, currency
}

func requireOwnQrOwner(w http.ResponseWriter, r *http.Request, ownerType, ownerID string) bool {
	if !strings.EqualFold(ownerType, "MERCHANT") {
		businessTenantDenials.WithLabelValues(tenantSurfaceQr).Inc()
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"a Business may only create QR codes owned by itself")
		return false
	}
	p, ok := middleware.GetPrincipal(r.Context())
	if !ok || p.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant authentication required")
		return false
	}
	if ownerID != p.MerchantID {
		businessTenantDenials.WithLabelValues(tenantSurfaceQr).Inc()
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN",
			"a QR code may only be created for the authenticated merchant")
		return false
	}
	return true
}

// respondQrCoreError keeps a deliberate core rejection a client error instead of
// reporting it as a server fault. The QR surface mapped every failure to 500, so
// an unsupported currency, an invalid owner_type and a malformed payload all came
// back as "the server broke" (RA-050) — the RA-043 class on this handler.
func respondQrCoreError(w http.ResponseWriter, r *http.Request, err error, fallback string) {
	if ce, ok := service.AsCoreError(err); ok && ce.IsClientError() {
		code := ce.Code
		if code == "" {
			code = "INVALID_REQUEST"
		}
		msg := ce.Message
		if msg == "" {
			msg = fallback
		}
		apierror.Respond(w, r, ce.Status, code, msg)
		return
	}
	apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", fallback)
}

func (h *QrHandler) CreateStatic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID     string `json:"owner_id"`
		OwnerType   string `json:"owner_type"`
		Currency    string `json:"currency"`
		AmountMinor *int64 `json:"amount_minor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	body.OwnerType, body.Currency = qrDefaults(body.OwnerType, body.Currency)
	if body.OwnerID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_id is required")
		return
	}

	if !requireOwnQrOwner(w, r, body.OwnerType, body.OwnerID) {
		return
	}
	qrResp, err := h.svc.CreateStatic(r.Context(), service.CreateStaticQrRequest{
		OwnerID:     body.OwnerID,
		OwnerType:   body.OwnerType,
		Currency:    body.Currency,
		AmountMinor: body.AmountMinor,
	})
	if err != nil {
		respondQrCoreError(w, r, err, "could not create QR code")
		return
	}
	respond(w, http.StatusCreated, qrResp)
}

// POST /v1/qr/dynamic
// Body: {"owner_id":"...","owner_type":"...","currency":"AOA","amount_minor":50000,"expires_at":"...","reference":"..."}
func (h *QrHandler) CreateDynamic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID         string     `json:"owner_id"`
		OwnerType       string     `json:"owner_type"`
		Currency        string     `json:"currency"`
		AmountMinor     int64      `json:"amount_minor"`
		ExpiresAt       *time.Time `json:"expires_at"`
		Reference       string     `json:"reference"`
		WalletAccountID string     `json:"wallet_account_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	body.OwnerType, body.Currency = qrDefaults(body.OwnerType, body.Currency)
	switch {
	case body.OwnerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be positive")
		return
	case body.ExpiresAt == nil:
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "expires_at is required for dynamic QR codes")
		return
	case body.ExpiresAt.Before(time.Now()):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_EXPIRY", "expires_at must be in the future")
		return
	}

	if !requireOwnQrOwner(w, r, body.OwnerType, body.OwnerID) {
		return
	}
	qrResp, err := h.svc.CreateDynamic(r.Context(), service.CreateDynamicQrRequest{
		OwnerID:         body.OwnerID,
		OwnerType:       body.OwnerType,
		Currency:        body.Currency,
		AmountMinor:     body.AmountMinor,
		ExpiresAt:       *body.ExpiresAt,
		Reference:       body.Reference,
		WalletAccountID: body.WalletAccountID,
	})
	if err != nil {
		respondQrCoreError(w, r, err, "could not create QR code")
		return
	}
	respond(w, http.StatusCreated, qrResp)
}

// requireOwnedQr loads the QR named by {id} and enforces that the authenticated
// merchant OWNS it (SEC-016).
//
// A QR code carries a payee (OwnerType/OwnerID) and, for dynamic codes, an
// amount and a single-use lifecycle. Without this check any authenticated
// merchant could read another merchant's codes, and — far worse — POST
// /v1/qr/{id}/use would let them BURN a competitor's dynamic codes: each one is
// single-use, so the legitimate payer's scan then fails with QR_ALREADY_USED.
// That is payment disruption reachable with nothing but an id.
//
// Cross-owner access answers NOT_FOUND so the surface cannot be used to
// enumerate QR ids. Returns (qr, true) only when the caller may proceed.
func (h *QrHandler) requireOwnedQr(w http.ResponseWriter, r *http.Request) (*service.QrResponse, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return nil, false
	}
	qrResp, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, service.ErrQrNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "QR code not found")
			return nil, false
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch QR code")
		return nil, false
	}
	if qrResp == nil || qrResp.QrCode == nil ||
		qrResp.QrCode.OwnerType != "MERCHANT" || qrResp.QrCode.OwnerID != principal.MerchantID {
		slog.WarnContext(r.Context(), "qr.cross_owner_attempt",
			"path", r.URL.Path, "caller_merchant_id", principal.MerchantID)
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "QR code not found")
		return nil, false
	}
	return qrResp, true
}

// GET /v1/qr/{id}
func (h *QrHandler) Get(w http.ResponseWriter, r *http.Request) {
	qrResp, ok := h.requireOwnedQr(w, r)
	if !ok {
		return
	}
	respond(w, http.StatusOK, qrResp)
}

// POST /v1/qr/decode
// Body: {"payload": "<base64url string>"}
func (h *QrHandler) Decode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payload string `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Payload == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "payload is required")
		return
	}

	parsed, err := h.svc.Decode(r.Context(), body.Payload)
	if err != nil {
		if errors.Is(err, service.ErrQrInvalidPayload) {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PAYLOAD", err.Error())
			return
		}
		respondQrCoreError(w, r, err, "could not decode payload")
		return
	}
	respond(w, http.StatusOK, parsed)
}

// POST /v1/qr/pay
//
// Scan-to-pay. The body carries the payer's @banza handle, the scanned QR
// payload, and (for static QR only) the amount. The core resolves and
// integrity-verifies the QR, runs the Progressive-KYC gate, atomically claims a
// dynamic code, and settles the wallet transfer. The core's status + body are
// forwarded verbatim so the app sees the exact outcome code.
func (h *QrHandler) Pay(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IdempotencyKey string `json:"idempotency_key"`
		Payer          string `json:"payer"`
		Payload        string `json:"payload"`
		AmountMinor    *int64 `json:"amount_minor"`
		Note           string `json:"note"`
		DeviceID       string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	switch {
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	case body.Payer == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payer is required")
		return
	case body.Payload == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payload is required")
		return
	}

	status, raw, err := h.svc.Pay(r.Context(), service.PayQrRequest{
		IdempotencyKey: body.IdempotencyKey,
		Payer:          body.Payer,
		Payload:        body.Payload,
		AmountMinor:    body.AmountMinor,
		Note:           body.Note,
		// Device id from the body, falling back to the X-Device-Id header.
		DeviceID: cmp.Or(body.DeviceID, r.Header.Get("X-Device-Id")),
	})
	if err != nil {
		slog.WarnContext(r.Context(), "qr.pay.failed", "idempotency_key", body.IdempotencyKey, "error", err)
		apierror.Respond(w, r, http.StatusBadGateway, "UPSTREAM_ERROR", "payment could not be processed")
		return
	}

	// Flow log — operational ids only, no payer PII (correlation_id added by obs).
	slog.InfoContext(r.Context(), "qr.pay", "http_status", status, "idempotency_key", body.IdempotencyKey)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

// POST /v1/qr/{id}/use
func (h *QrHandler) MarkUsed(w http.ResponseWriter, r *http.Request) {
	owned, ok := h.requireOwnedQr(w, r)
	if !ok {
		return
	}
	id := owned.QrCode.ID
	qr, err := h.svc.MarkUsed(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrQrNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "QR code not found")
		case errors.Is(err, service.ErrQrExpired):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "QR_EXPIRED", "QR code has expired")
		case errors.Is(err, service.ErrQrAlreadyUsed):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "QR_ALREADY_USED", "QR code has already been used")
		case errors.Is(err, service.ErrQrCannotMarkStaticUsed):
			apierror.Respond(w, r, http.StatusBadRequest, "STATIC_QR", "static QR codes cannot be marked as used")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not mark QR code as used")
		}
		return
	}
	respond(w, http.StatusOK, qr)
}
