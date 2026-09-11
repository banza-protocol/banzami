package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
	"github.com/banzami/banzami/services/common/env"
)

// KycReviewHandler is the operator review surface for consumer KYC (ADR-020).
// The operator decides the granted level here; nothing is auto-approved. Logs
// and responses never carry a storage_key (only short-lived signed downloads).
//
// KYC is admin-api-owned (no gateway hop). LIVE uses the primary database;
// SANDBOX uses the optional staging database (banzami_staging). When sandbox is
// requested but not configured the handler responds 503 — it never falls back to
// live data.
type KycReviewHandler struct {
	live    *service.KycReviewService
	sandbox *service.KycReviewService
}

func NewKycReviewHandler(live, sandbox *service.KycReviewService) *KycReviewHandler {
	return &KycReviewHandler{live: live, sandbox: sandbox}
}

// pick returns the review service for the requested environment. SANDBOX selects
// the staging service; ok=false when sandbox is requested but not configured.
//
// It answers the request itself when it returns false: 400 for an environment
// it does not recognise (see requestedEnvironment), 503 when the environment
// has no review service.
func (h *KycReviewHandler) pick(w http.ResponseWriter, r *http.Request) (*service.KycReviewService, bool) {
	e, ok := requestedEnvironment(w, r)
	if !ok {
		return nil, false
	}
	svc := h.live
	if e.IsSandbox() {
		svc = h.sandbox
	}
	if svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "kyc review unavailable for this environment")
		return nil, false
	}
	return svc, true
}

// GET /admin/v1/kyc/cases?status=&environment=&limit=
func (h *KycReviewHandler) List(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	envFilter := "" // absent: every case in the pool, as before
	if r.URL.Query().Has("environment") {
		envFilter = env.Parse(r.URL.Query().Get("environment")).String() // canonical; pick refused anything else
	}
	cases, err := svc.ListCases(r.Context(), r.URL.Query().Get("status"), envFilter, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list cases")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cases": cases})
}

// GET /admin/v1/kyc/cases/{id}
func (h *KycReviewHandler) Get(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	d, err := svc.GetCase(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// GET /admin/v1/kyc/cases/{id}/timeline
func (h *KycReviewHandler) Timeline(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	ev, err := svc.Timeline(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": ev})
}

// POST /admin/v1/kyc/evidence/{id}/read-url   {intent?: view|download|copy}
//
// Mints a short-TTL signed GET on demand. The signed URL is returned to the
// operator and audited as an access event (VIEW/DOWNLOAD/COPY) but NEVER stored:
// not in the audit row, not anywhere. storage_key is never exposed.
func (h *KycReviewHandler) ReadURL(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	var body struct {
		Intent string `json:"intent"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body)
	id := chi.URLParam(r, "id")
	url, err := svc.ReadEvidenceURL(r.Context(), id)
	if err != nil {
		h.fail(w, err)
		return
	}
	kycAudit(r, kycAccessAction(body.Intent), "kyc_evidence", id, map[string]any{"access": kycAccessAction(body.Intent)})
	writeJSON(w, http.StatusOK, map[string]any{"download_url": url})
}

// POST /admin/v1/kyc/cases/{id}/approve   body: {granted_level, notes}
func (h *KycReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	var body struct {
		GrantedLevel string `json:"granted_level"`
		Notes        string `json:"notes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := svc.Approve(r.Context(), caseID, actorOf(r), body.GrantedLevel, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	// Internal notes stay operator-only (kyc_reviews + event payload); the audit row
	// keeps the decision + granted level, never the free-text notes.
	kycAudit(r, "APPROVE_KYC", "kyc_case", caseID, map[string]any{"decision": "APPROVED", "granted_level": body.GrantedLevel})
	writeJSON(w, http.StatusOK, d)
}

// POST /admin/v1/kyc/cases/{id}/reject   body: {reason_code, notes}
func (h *KycReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	var body struct {
		ReasonCode string `json:"reason_code"`
		Notes      string `json:"notes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := svc.Reject(r.Context(), caseID, actorOf(r), body.ReasonCode, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	// reason_code is consumer-facing (surfaced by the Consumer app); notes are not.
	kycAudit(r, "REJECT_KYC", "kyc_case", caseID, map[string]any{"decision": "REJECTED", "reason_code": body.ReasonCode})
	writeJSON(w, http.StatusOK, d)
}

// POST /admin/v1/kyc/cases/{id}/request-more-info   body: {reason_code, notes}
func (h *KycReviewHandler) RequestMoreInfo(w http.ResponseWriter, r *http.Request) {
	svc, ok := h.pick(w, r)
	if !ok {
		return
	}
	var body struct {
		ReasonCode string `json:"reason_code"`
		Notes      string `json:"notes"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)
	caseID := chi.URLParam(r, "id")
	d, err := svc.RequestMoreInfo(r.Context(), caseID, actorOf(r), body.ReasonCode, body.Notes)
	if err != nil {
		h.fail(w, err)
		return
	}
	kycAudit(r, "REQUEST_KYC_MORE_INFO", "kyc_case", caseID, map[string]any{"decision": "NEEDS_MORE_INFO", "reason_code": body.ReasonCode})
	writeJSON(w, http.StatusOK, d)
}

func (h *KycReviewHandler) fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrKycCaseNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "kyc case not found")
	case errors.Is(err, service.ErrKycEvidenceNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "kyc evidence not found")
	case errors.Is(err, service.ErrKycStorageDisabled):
		writeError(w, http.StatusServiceUnavailable, "STORAGE_NOT_CONFIGURED", "evidence storage is not configured")
	case errors.Is(err, service.ErrKycEvidenceNotStored):
		writeError(w, http.StatusConflict, "OBJECT_NOT_UPLOADED", "evidence has not been uploaded")
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

// kycAccessAction maps a UI intent to the canonical audit action for evidence
// access. Defaults to VIEW_KYC_DOCUMENT for any unknown/empty intent.
func kycAccessAction(intent string) string {
	switch intent {
	case "download":
		return "DOWNLOAD_KYC_DOCUMENT"
	case "copy":
		return "COPY_KYC_SIGNED_URL"
	default:
		return "VIEW_KYC_DOCUMENT"
	}
}

// kycAudit records an explicit action name + an after-only payload. The signed
// URL and free-text notes are deliberately omitted from `after`.
func kycAudit(r *http.Request, action, entityType, id string, after map[string]any) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = action
		a.EntityType = entityType
		a.EntityID = id
		a.After = after
	})
}
