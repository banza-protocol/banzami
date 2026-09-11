package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ComplianceHandler manages KYB/AML operations for merchants.
type ComplianceHandler struct {
	core *service.CoreAdminClient
}

func NewComplianceHandler(core *service.CoreAdminClient) *ComplianceHandler {
	return &ComplianceHandler{core: core}
}

// GetMerchant handles GET /admin/v1/compliance/merchants/{id}.
// Returns the merchant's KYB + AML status, creating a Pending record on first access.
func (h *ComplianceHandler) GetMerchant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	record, err := h.core.GetMerchantCompliance(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, record)
}

// ApproveMerchant handles POST /admin/v1/compliance/merchants/{id}/approve  {notes}.
// Approves KYB (and AML while it is still pending). Core refuses it for a
// suspended merchant and leaves an AML review flag standing (A5-06); the
// operator states why, as for every other compliance decision.
func (h *ComplianceHandler) ApproveMerchant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body notesBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Notes) == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "notes is required: say why this merchant is approved")
		return
	}
	record, err := h.core.ApproveMerchant(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "merchant", id, map[string]any{"merchant_id": id, "decision": "APPROVE", "notes": body.Notes, "record": record})
	writeJSON(w, http.StatusOK, record)
}

type notesBody struct {
	Notes string `json:"notes"`
}

// RejectMerchant handles POST /admin/v1/compliance/merchants/{id}/reject.
func (h *ComplianceHandler) RejectMerchant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body notesBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Notes == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "notes is required")
		return
	}
	record, err := h.core.RejectMerchant(r.Context(), id, body.Notes)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "merchant", id, map[string]any{"merchant_id": id, "kyb_status": "REJECTED", "notes": body.Notes})
	writeJSON(w, http.StatusOK, record)
}

// SuspendMerchant handles POST /admin/v1/compliance/merchants/{id}/suspend.
// Immediately halts all transaction processing for the merchant.
func (h *ComplianceHandler) SuspendMerchant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body notesBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Notes == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "notes is required")
		return
	}
	record, err := h.core.SuspendMerchant(r.Context(), id, body.Notes)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "merchant", id, map[string]any{"merchant_id": id, "status": "SUSPENDED", "notes": body.Notes})
	writeJSON(w, http.StatusOK, record)
}

// FlagAML handles POST /admin/v1/compliance/merchants/{id}/flag-aml.
// Moves AML status to UNDER_REVIEW, blocking transaction processing pending investigation.
func (h *ComplianceHandler) FlagAML(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body notesBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Notes == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "notes is required")
		return
	}
	record, err := h.core.FlagMerchantAML(r.Context(), id, body.Notes)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "merchant", id, map[string]any{"merchant_id": id, "aml_status": "UNDER_REVIEW", "notes": body.Notes})
	writeJSON(w, http.StatusOK, record)
}
