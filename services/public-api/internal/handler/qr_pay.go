// Paying a structured Banzami QR from the consumer's own wallet (CAP-PAY-003).
//
// The capability existed everywhere except here. QR codes could be created,
// decoded, read and marked used; the core engine could resolve a payload into a
// verified payment target and roll a claim back. Nothing could pay one, because
// the only route that ever tried took the payer as a free-text field on a
// MERCHANT credential — anyone holding a merchant key could name any consumer
// and take their money — and it was withdrawn rather than patched (RA-053).
//
// This is the surface the authority contract specifies
// (docs/security/QR-PAY-AUTHORITY-CONTRACT.md): the consumer API, a consumer
// session, and a payer that is not a request field at all. The body carries the
// scanned payload, which identifies the RECIPIENT, and nothing that says who is
// paying. There is no field to forge.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// qrPayExecutor is satisfied by *service.CorePublicClient and by test fakes.
type qrPayExecutor interface {
	PayQr(ctx context.Context, req service.PayQrRequest) (*service.QrPayment, error)
}

type QrPayHandler struct {
	core qrPayExecutor
}

func NewQrPayHandler(core *service.CorePublicClient) *QrPayHandler {
	return &QrPayHandler{core: core}
}

func newQrPayHandlerWithFakes(exec qrPayExecutor) *QrPayHandler {
	return &QrPayHandler{core: exec}
}

// POST /v1/qr/pay
//
// Authenticated. Body: {payload, amount_minor?, idempotency_key?}.
//
// `amount_minor` is only meaningful for a static (open-amount) QR. A dynamic
// QR's amount is fixed in its signed record and a supplied value is ignored by
// Core — not compared, ignored, because the point of a fixed-amount code is that
// the payer cannot change what they are being asked for.
func (h *QrPayHandler) Pay(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	var body struct {
		Payload        string  `json:"payload"`
		AmountMinor    *int64  `json:"amount_minor"`
		IdempotencyKey *string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if body.Payload == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PAYLOAD", "payload is required")
		return
	}

	// A caller that supplies no key still gets idempotency, just not one they can
	// retry against. Paying twice by a double tap is the failure this prevents;
	// a client that wants safe retries sends its own key.
	idempotencyKey := uuid.New().String()
	if body.IdempotencyKey != nil && *body.IdempotencyKey != "" {
		idempotencyKey = *body.IdempotencyKey
	}

	payment, err := h.core.PayQr(r.Context(), service.PayQrRequest{
		PayerConsumerID: consumer.ID, // from the session — never from the body
		Payload:         body.Payload,
		AmountMinor:     body.AmountMinor,
		IdempotencyKey:  idempotencyKey,
	})
	if err != nil {
		respondQrPayError(w, r, err)
		return
	}

	respond(w, http.StatusOK, payment)
}

// respondQrPayError uses the status codes the QR lifecycle contract mandates:
// 404 for a code that does not exist, 422 for one that cannot be paid in the
// state it is in, 400 for a payload that is not a Banzami QR at all.
func respondQrPayError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrQrNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "QR_NOT_FOUND", "QR code not found")
	case errors.Is(err, service.ErrQrInvalidPayload):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PAYLOAD", "this is not a Banzami QR code")
	case errors.Is(err, service.ErrQrInvalidSignature):
		// Deliberately 422 and not 403: the code is well-formed and simply does
		// not verify. Saying "forbidden" would suggest the payer lacks
		// permission, when what failed is the code's own integrity.
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "INVALID_SIGNATURE",
			"this QR code could not be verified")
	case errors.Is(err, service.ErrQrExpired):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "QR_EXPIRED", "this QR code has expired")
	case errors.Is(err, service.ErrQrAlreadyUsed):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "QR_ALREADY_USED",
			"this QR code has already been paid")
	case errors.Is(err, service.ErrQrAmountRequired):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "AMOUNT_REQUIRED",
			"this QR code has no amount — supply one")
	case errors.Is(err, service.ErrQrAmountInvalid):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "AMOUNT_NEGATIVE",
			"the amount must be positive")
	case errors.Is(err, service.ErrQrInvalidAccount):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "INVALID_WALLET_ACCOUNT",
			"the account this QR code routes to is no longer available")
	case errors.Is(err, service.ErrTransferInsufficientFunds):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "INSUFFICIENT_FUNDS", "insufficient funds")
	case errors.Is(err, service.ErrTransferWalletNotFound):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "WALLET_NOT_FOUND", "no active wallet")
	case errors.Is(err, service.ErrTransferWalletLocked):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "ACCOUNT_FROZEN", "account is frozen")
	case errors.Is(err, service.ErrTransferSelfTransfer):
		apierror.Respond(w, r, http.StatusBadRequest, "SELF_PAYMENT_NOT_ALLOWED",
			"you cannot pay your own QR code")
	default:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
			"payment could not be processed")
	}
}
