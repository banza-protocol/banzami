package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// KycReviewHandler is the operator review surface for consumer KYC (ADR-020).
// The operator decides the granted level here; nothing is auto-approved. Logs
// and responses never carry a storage_key (only short-lived signed downloads).
type KycReviewHandler struct {
	svc *service.KycReviewService
}

func NewKycReviewHandler(svc *service.KycReviewService) *KycReviewHandler {
	return &KycReviewHandler{svc: svc}
}

// GET /admin/v1/kyc/cases?status=&environment=&limit=
func (h *KycReviewHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	cases, err := h.svc.ListCases(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("environment"), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list cases")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cases": cases})
}

// GET /admin/v1/kyc/cases/{id}
func (h *KycReviewHandler) Get(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable")
		return
	}
	d, err := h.svc.GetCase(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// POST /admin/v1/kyc/cases/{id}/approve   body: {granted_level, notes}
func (h *KycReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable")
		return
	}
	var body struct {
		GrantedLevel string `json:"granted_level"`
		Notes        string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := h.svc.Approve(r.Context(), caseID, actorOf(r), body.GrantedLevel, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	auditAfter(r, "kyc_case", caseID, map[string]any{"decision": "APPROVED", "granted_level": body.GrantedLevel})
	writeJSON(w, http.StatusOK, d)
}

// POST /admin/v1/kyc/cases/{id}/reject   body: {reason_code, notes}
func (h *KycReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable")
		return
	}
	var body struct {
		ReasonCode string `json:"reason_code"`
		Notes      string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := h.svc.Reject(r.Context(), caseID, actorOf(r), body.ReasonCode, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	auditAfter(r, "kyc_case", caseID, map[string]any{"decision": "REJECTED", "reason_code": body.ReasonCode})
	writeJSON(w, http.StatusOK, d)
}

// POST /admin/v1/kyc/cases/{id}/request-more-info   body: {reason_code, notes}
func (h *KycReviewHandler) RequestMoreInfo(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable")
		return
	}
	var body struct {
		ReasonCode string `json:"reason_code"`
		Notes      string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := h.svc.RequestMoreInfo(r.Context(), caseID, actorOf(r), body.ReasonCode, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	auditAfter(r, "kyc_case", caseID, map[string]any{"decision": "NEEDS_MORE_INFO", "reason_code": body.ReasonCode})
	writeJSON(w, http.StatusOK, d)
}

func (h *KycReviewHandler) fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrKycCaseNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "kyc case not found")
	case errors.Is(err, service.ErrKycInvalidState):
		writeError(w, http.StatusConflict, "INVALID_STATE", "case is not under review")
	case errors.Is(err, service.ErrKycInvalidLevel):
		writeError(w, http.StatusBadRequest, "INVALID_LEVEL", err.Error())
	case errors.Is(err, service.ErrKycReasonRequired):
		writeError(w, http.StatusBadRequest, "REASON_REQUIRED", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not process the request")
	}
}
