package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type RefundHandler struct {
	svc    service.RefundService
	proofs *service.ProofService // optional; flips the transaction proof to REVERSED
}

func NewRefundHandler(svc service.RefundService, proofs *service.ProofService) *RefundHandler {
	return &RefundHandler{svc: svc, proofs: proofs}
}

// POST /v1/refunds
func (h *RefundHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}

	var body struct {
		TransactionID  string `json:"transaction_id"`
		AmountMinor    int64  `json:"amount_minor"`
		Reason         string `json:"reason"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.TransactionID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "transaction_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	}

	refund, err := h.svc.Create(r.Context(), service.CreateRefundRequest{
		TransactionID:  body.TransactionID,
		MerchantID:     principal.MerchantID,
		AmountMinor:    body.AmountMinor,
		Reason:         body.Reason,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// Proactively flip the transaction's public proof to REVERSED: a refunded
	// payment must not keep showing a green "verified" proof. Best-effort +
	// idempotent (MarkReversed is a no-op if there is no proof yet; Ensure will
	// then materialize it as REVERSED on the next receipt). Audit Part 7 / Unit 3.
	if h.proofs != nil {
		if err := h.proofs.MarkReversed(r.Context(), body.TransactionID, principal.Environment); err != nil {
			slog.ErrorContext(r.Context(), "proof.mark_reversed.failed", "transaction_id", body.TransactionID, "error", err)
		} else {
			slog.InfoContext(r.Context(), "proof.reversed", "transaction_id", body.TransactionID, "cause", "refund")
		}
	}

	respond(w, http.StatusCreated, refund)
}

// GET /v1/refunds/{id}
func (h *RefundHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	refund, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrRefundNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "refund not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch refund")
		return
	}
	respond(w, http.StatusOK, refund)
}

// GET /v1/refunds?transaction_id=&limit=
func (h *RefundHandler) List(w http.ResponseWriter, r *http.Request) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid merchant credentials required")
		return
	}

	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}

	page, err := h.svc.List(r.Context(),
		r.URL.Query().Get("transaction_id"),
		principal.MerchantID,
		limit,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list refunds")
		return
	}
	respond(w, http.StatusOK, page)
}
