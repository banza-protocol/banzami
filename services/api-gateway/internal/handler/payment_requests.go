package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type PaymentRequestHandler struct {
	svc service.PaymentRequestService
}

func NewPaymentRequestHandler(svc service.PaymentRequestService) *PaymentRequestHandler {
	return &PaymentRequestHandler{svc: svc}
}

// POST /v1/payment-requests
func (h *PaymentRequestHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RequesterID    string `json:"requester_id"`
		PayerID        string `json:"payer_id"`
		AmountMinor    int64  `json:"amount_minor"`
		Currency       string `json:"currency"`
		Message        string `json:"message"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.RequesterID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "requester_id is required")
		return
	case body.PayerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payer_id is required")
		return
	case body.AmountMinor <= 0:
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_AMOUNT", "amount_minor must be a positive integer")
		return
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	}

	if body.Currency == "" {
		body.Currency = "AOA"
	}

	req, err := h.svc.Create(r.Context(), service.CreatePaymentRequestReq{
		RequesterID:    body.RequesterID,
		PayerID:        body.PayerID,
		AmountMinor:    body.AmountMinor,
		Currency:       body.Currency,
		Message:        body.Message,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	respond(w, http.StatusCreated, req)
}

// GET /v1/payment-requests/{id}
func (h *PaymentRequestHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	req, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrPaymentRequestNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment request not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch payment request")
		return
	}
	respond(w, http.StatusOK, req)
}

// GET /v1/payment-requests?requester_id=&payer_id=&status=&limit=
func (h *PaymentRequestHandler) List(w http.ResponseWriter, r *http.Request) {
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
		r.URL.Query().Get("requester_id"),
		r.URL.Query().Get("payer_id"),
		r.URL.Query().Get("status"),
		limit,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list payment requests")
		return
	}
	respond(w, http.StatusOK, page)
}

// POST /v1/payment-requests/{id}/pay
func (h *PaymentRequestHandler) Pay(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		PayerID        string `json:"payer_id"`
		IdempotencyKey string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.PayerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payer_id is required")
		return
	case body.IdempotencyKey == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "idempotency_key is required")
		return
	}

	req, err := h.svc.Pay(r.Context(), service.PayPaymentRequestReq{
		RequestID:      id,
		PayerID:        body.PayerID,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		if errors.Is(err, service.ErrPaymentRequestNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment request not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	respond(w, http.StatusOK, req)
}

// POST /v1/payment-requests/{id}/decline
func (h *PaymentRequestHandler) Decline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		PayerID string `json:"payer_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.PayerID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "payer_id is required")
		return
	}

	req, err := h.svc.Decline(r.Context(), id, body.PayerID)
	if err != nil {
		if errors.Is(err, service.ErrPaymentRequestNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment request not found or not pending")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	respond(w, http.StatusOK, req)
}

// POST /v1/payment-requests/{id}/cancel
func (h *PaymentRequestHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		RequesterID string `json:"requester_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.RequesterID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "requester_id is required")
		return
	}

	req, err := h.svc.Cancel(r.Context(), id, body.RequesterID)
	if err != nil {
		if errors.Is(err, service.ErrPaymentRequestNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment request not found or not pending")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	respond(w, http.StatusOK, req)
}
