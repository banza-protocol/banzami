package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type DisputeHandler struct {
	svc service.DisputeService
}

func NewDisputeHandler(svc service.DisputeService) *DisputeHandler {
	return &DisputeHandler{svc: svc}
}

// POST /v1/disputes — consumer opens a dispute
// disputeMerchant is the calling Business. The merchant surface refuses any
// other principal (RequireMerchantExcept), but a handler that moves or reveals
// a tenant's data names its tenant itself.
//
// None of these handlers read the principal: any merchant listed every tenant's
// disputes (transaction ids, consumer ids, amounts), read any dispute and its
// evidence by id, added evidence to it, and opened a dispute on any captured
// transaction.
func disputeMerchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	if mid, ok := merchantPrincipalID(r); ok {
		return mid, true
	}
	apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant credentials required")
	return "", false
}

// ownDispute loads a dispute of the calling merchant; another merchant's is
// indistinguishable from a missing one.
func (h *DisputeHandler) ownDispute(w http.ResponseWriter, r *http.Request, id string) (*service.Dispute, bool) {
	mid, ok := disputeMerchant(w, r)
	if !ok {
		return nil, false
	}
	d, err := h.svc.Get(r.Context(), id)
	if err != nil || d == nil || d.MerchantID != mid {
		if err != nil && !errors.Is(err, service.ErrDisputeNotFound) {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch dispute")
			return nil, false
		}
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "dispute not found")
		return nil, false
	}
	return d, true
}

func (h *DisputeHandler) Open(w http.ResponseWriter, r *http.Request) {
	mid, ok := disputeMerchant(w, r)
	if !ok {
		return
	}
	var body struct {
		TransactionID string `json:"transaction_id"`
		ConsumerID    string `json:"consumer_id"`
		Reason        string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.TransactionID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "transaction_id is required")
		return
	case body.ConsumerID == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "consumer_id is required")
		return
	case body.Reason == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "reason is required")
		return
	}

	dispute, err := h.svc.Open(r.Context(), service.OpenDisputeRequest{
		TransactionID: body.TransactionID,
		ConsumerID:    body.ConsumerID,
		Reason:        body.Reason,
		MerchantID:    mid,
	})
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(strings.ToLower(err.Error()), "not found") {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "transaction not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not open dispute")
		return
	}
	respond(w, http.StatusCreated, dispute)
}

// GET /v1/disputes/{id}
func (h *DisputeHandler) Get(w http.ResponseWriter, r *http.Request) {
	dispute, ok := h.ownDispute(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	respond(w, http.StatusOK, dispute)
}

func (h *DisputeHandler) List(w http.ResponseWriter, r *http.Request) {
	mid, ok := disputeMerchant(w, r)
	if !ok {
		return
	}
	if q := r.URL.Query().Get("merchant_id"); q != "" && q != mid {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "disputes can only be listed for your own merchant")
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
		mid,
		r.URL.Query().Get("consumer_id"),
		r.URL.Query().Get("status"),
		limit,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list disputes")
		return
	}
	respond(w, http.StatusOK, page)
}

// POST /v1/disputes/{id}/evidence
func (h *DisputeHandler) SubmitEvidence(w http.ResponseWriter, r *http.Request) {
	disputeID := chi.URLParam(r, "id")
	if _, ok := h.ownDispute(w, r, disputeID); !ok {
		return
	}

	var body struct {
		SubmittedBy string `json:"submitted_by"`
		Party       string `json:"party"`
		Description string `json:"description"`
		FileURL     string `json:"file_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	switch {
	case body.SubmittedBy == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "submitted_by is required")
		return
	case body.Party != "MERCHANT":
		// This is the Business's surface: it speaks for the merchant, never
		// as the consumer.
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PARTY", "party must be MERCHANT on the merchant surface")
		return
	case body.Description == "":
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_FIELD", "description is required")
		return
	}

	evidence, err := h.svc.SubmitEvidence(r.Context(), service.SubmitEvidenceRequest{
		DisputeID:   disputeID,
		SubmittedBy: body.SubmittedBy,
		Party:       body.Party,
		Description: body.Description,
		FileURL:     body.FileURL,
	})
	if err != nil {
		if errors.Is(err, service.ErrDisputeNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		slog.ErrorContext(r.Context(), "dispute.evidence.submit_failed", "dispute_id", disputeID, "error", err)
		respondCoreError(w, r, err, "could not submit the evidence")
		return
	}
	respond(w, http.StatusCreated, evidence)
}

// GET /v1/disputes/{id}/evidence
func (h *DisputeHandler) ListEvidence(w http.ResponseWriter, r *http.Request) {
	disputeID := chi.URLParam(r, "id")
	if _, ok := h.ownDispute(w, r, disputeID); !ok {
		return
	}
	page, err := h.svc.ListEvidence(r.Context(), disputeID)
	if err != nil {
		if errors.Is(err, service.ErrDisputeNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "dispute not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch evidence")
		return
	}
	respond(w, http.StatusOK, page)
}
