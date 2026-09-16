// Paying a scanned Business Receive Point from the consumer's own wallet (ADR-065).
//
// The QR a Business prints is persistent and resolves a public identity; the payer
// then mints a FRESH Payment Session per payment. As with QR pay (RA-053), the
// payer is THIS session's consumer and is never a body field — the entire authority
// difference from a merchant-created session. The payee is server-resolved from the
// slug by the gateway; nothing the client sends chooses the destination.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// receivePointGateway is the gateway capability the handler needs.
// *service.ReceivePointClient satisfies it; tests supply a fake.
type receivePointGateway interface {
	Resolve(ctx context.Context, slug string) (*service.ReceivePointResolved, error)
	Mint(ctx context.Context, slug, payerID string, amountMinor int64, idempotencyKey string) (*service.MintedSession, error)
}

type ReceivePointHandler struct {
	gw receivePointGateway
}

func NewReceivePointHandler(gw *service.ReceivePointClient) *ReceivePointHandler {
	return &ReceivePointHandler{gw: gw}
}

func newReceivePointHandlerWithFake(gw receivePointGateway) *ReceivePointHandler {
	return &ReceivePointHandler{gw: gw}
}

// GET /v1/receive-points/{slug} — resolve a scanned receive point to the payer-safe
// Business identity. No JWT: the pay web app reads it before a consumer signs in.
func (h *ReceivePointHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_SLUG", "slug is required")
		return
	}
	res, err := h.gw.Resolve(r.Context(), slug)
	if err != nil {
		respondReceivePointError(w, r, err)
		return
	}
	respond(w, http.StatusOK, res)
}

// POST /v1/receive-points/{slug}/pay — mint a fresh Payment Session for the signed-in
// consumer. The payer is the session's consumer, never a body field.
func (h *ReceivePointHandler) Pay(w http.ResponseWriter, r *http.Request) {
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_SLUG", "slug is required")
		return
	}
	var body struct {
		AmountMinor    *int64  `json:"amount_minor"`
		IdempotencyKey *string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if body.AmountMinor == nil || *body.AmountMinor <= 0 {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	}
	// A caller that supplies no key still gets idempotency, just not one it can
	// retry against — paying twice on a double tap is the failure this prevents.
	idempotencyKey := uuid.New().String()
	if body.IdempotencyKey != nil && *body.IdempotencyKey != "" {
		idempotencyKey = *body.IdempotencyKey
	}
	session, err := h.gw.Mint(r.Context(), slug, consumer.ID, *body.AmountMinor, idempotencyKey)
	if err != nil {
		respondReceivePointError(w, r, err)
		return
	}
	respond(w, http.StatusCreated, session)
}

func respondReceivePointError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrReceivePointNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "RECEIVE_POINT_NOT_FOUND", "receive point not found")
	case errors.Is(err, service.ErrReceivePointDisabled):
		apierror.Respond(w, r, http.StatusConflict, "RECEIVE_POINT_DISABLED", "this receive point is no longer active")
	case errors.Is(err, service.ErrReceivePointIneligible):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "BUSINESS_CANNOT_RECEIVE", "this business cannot receive payments right now")
	case errors.Is(err, service.ErrReceivePointMintKey):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_IDEMPOTENCY_KEY", "idempotency key is invalid")
	case errors.Is(err, service.ErrReceivePointConflict):
		apierror.Respond(w, r, http.StatusConflict, "IDEMPOTENCY_KEY_REUSED", "this idempotency key was used for a different payment")
	case errors.Is(err, service.ErrReceivePointPending):
		w.Header().Set("Retry-After", "1")
		apierror.Respond(w, r, http.StatusConflict, "MINT_IN_PROGRESS", "a payment for this key is in progress; retry")
	default:
		apierror.Respond(w, r, http.StatusBadGateway, "RECEIVE_POINT_UNAVAILABLE", "the receive point is temporarily unavailable")
	}
}
