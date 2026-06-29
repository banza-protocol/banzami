package handler

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// FinanceAuditHandler exposes the read/audit surfaces for Operator Fees and
// Application Settlements (Banzami ADR-021). Operator fees are immutable;
// settlements may be cancelled/failed only when their state permits (enforced by
// the core). Reads are not audited; cancel/fail are.
type FinanceAuditHandler struct {
	core *service.CoreAdminClient
}

func NewFinanceAuditHandler(core *service.CoreAdminClient) *FinanceAuditHandler {
	return &FinanceAuditHandler{core: core}
}

// forwardQuery copies only the whitelisted keys to the core query string.
func forwardQuery(r *http.Request, keys ...string) string {
	q := url.Values{}
	for _, k := range keys {
		if v := r.URL.Query().Get(k); v != "" {
			q.Set(k, v)
		}
	}
	return q.Encode()
}

// ── Dashboard (read-only aggregates) ────────────────────────────────────────

func (h *FinanceAuditHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	q := forwardQuery(r, "environment", "currency", "from", "to")
	result, err := h.core.GetFinanceDashboard(r.Context(), q)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── Operator Fees (read-only) ───────────────────────────────────────────────

func (h *FinanceAuditHandler) ListOperatorFees(w http.ResponseWriter, r *http.Request) {
	q := forwardQuery(r, "environment", "currency", "business_category", "pricing_profile",
		"pricing_rule_id", "transaction_id", "status", "from", "to", "limit")
	result, err := h.core.ListOperatorFees(r.Context(), q)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *FinanceAuditHandler) GetOperatorFee(w http.ResponseWriter, r *http.Request) {
	result, err := h.core.GetOperatorFee(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── Application Settlements (read + cancel/fail) ────────────────────────────

func (h *FinanceAuditHandler) ListSettlements(w http.ResponseWriter, r *http.Request) {
	q := forwardQuery(r, "owner_ref", "status", "currency", "business_category",
		"pricing_profile", "environment", "from", "to", "limit")
	result, err := h.core.ListApplicationSettlements(r.Context(), q)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *FinanceAuditHandler) GetSettlement(w http.ResponseWriter, r *http.Request) {
	result, err := h.core.GetApplicationSettlement(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *FinanceAuditHandler) CancelSettlement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.CancelApplicationSettlement(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "application_settlement", id, map[string]any{"action": "CANCELLED"})
	writeJSON(w, http.StatusOK, result)
}

func (h *FinanceAuditHandler) FailSettlement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "a non-empty reason is required")
		return
	}
	result, err := h.core.FailApplicationSettlement(r.Context(), id, map[string]any{"reason": body.Reason})
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "application_settlement", id, map[string]any{"action": "FAILED", "reason": body.Reason})
	writeJSON(w, http.StatusOK, result)
}
