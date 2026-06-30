package handler

import (
	"cmp"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
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
	switch {
	case body.OwnerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_id is required")
		return
	case body.OwnerType == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_type is required (CONSUMER or MERCHANT)")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
		return
	}

	qrResp, err := h.svc.CreateStatic(r.Context(), service.CreateStaticQrRequest{
		OwnerID:     body.OwnerID,
		OwnerType:   body.OwnerType,
		Currency:    body.Currency,
		AmountMinor: body.AmountMinor,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create QR code")
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
	switch {
	case body.OwnerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_id is required")
		return
	case body.OwnerType == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "owner_type is required")
		return
	case body.Currency == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "currency is required")
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
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create QR code")
		return
	}
	respond(w, http.StatusCreated, qrResp)
}

// GET /v1/qr/{id}
func (h *QrHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	qrResp, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrQrNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "QR code not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch QR code")
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
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not decode payload")
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
	id := chi.URLParam(r, "id")
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
