package handler

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// PricingRuleHandler manages operator pricing rules (Banzami ADR-021).
//
// Pricing rules are the ONLY place fee percentages live; this is the operator's
// administrative write path (BANZADMIN -> admin-api -> core-api). The core
// resolves every fee and enforces the invariants (never delete; a used rule is
// superseded by a new version, never edited in place). No app reaches this.
type PricingRuleHandler struct {
	core *service.CoreAdminClient
}

func NewPricingRuleHandler(core *service.CoreAdminClient) *PricingRuleHandler {
	return &PricingRuleHandler{core: core}
}

// List handles GET /admin/v1/finance/pricing-rules.
// Only whitelisted filters are forwarded; arbitrary query params are dropped.
func (h *PricingRuleHandler) List(w http.ResponseWriter, r *http.Request) {
	q := url.Values{}
	for _, key := range []string{"environment", "business_category", "pricing_profile", "currency", "rule_key", "status", "limit"} {
		if v := r.URL.Query().Get(key); v != "" {
			q.Set(key, v)
		}
	}
	result, err := h.core.ListPricingRules(r.Context(), q.Encode())
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Get handles GET /admin/v1/finance/pricing-rules/{id}.
func (h *PricingRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
	result, err := h.core.GetPricingRule(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Versions handles GET /admin/v1/finance/pricing-rules/{id}/versions.
func (h *PricingRuleHandler) Versions(w http.ResponseWriter, r *http.Request) {
	result, err := h.core.GetPricingRuleVersions(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Create handles POST /admin/v1/finance/pricing-rules.
func (h *PricingRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	result, err := h.core.CreatePricingRule(r.Context(), body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "pricing_rule", idOf(result), pricingAudit(body, result))
	writeJSON(w, http.StatusCreated, result)
}

// Update handles PATCH /admin/v1/finance/pricing-rules/{id}.
// A used rule is superseded by a new version; the response is the resulting rule.
func (h *PricingRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	result, err := h.core.UpdatePricingRule(r.Context(), id, body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditChange(r, "pricing_rule", id, map[string]any{"rule_id": id}, pricingAudit(body, result))
	writeJSON(w, http.StatusOK, result)
}

// Disable handles POST /admin/v1/finance/pricing-rules/{id}/disable.
func (h *PricingRuleHandler) Disable(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.DisablePricingRule(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "pricing_rule", id, map[string]any{"rule_id": id, "enabled": false})
	writeJSON(w, http.StatusOK, result)
}

// Enable handles POST /admin/v1/finance/pricing-rules/{id}/enable.
func (h *PricingRuleHandler) Enable(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.EnablePricingRule(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "pricing_rule", id, map[string]any{"rule_id": id, "enabled": true})
	writeJSON(w, http.StatusOK, result)
}

// Duplicate handles POST /admin/v1/finance/pricing-rules/{id}/duplicate.
func (h *PricingRuleHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	result, err := h.core.DuplicatePricingRule(r.Context(), id, body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "pricing_rule", idOf(result), map[string]any{"duplicated_from": id, "rule_key": body["rule_key"]})
	writeJSON(w, http.StatusCreated, result)
}

// idOf reads the id from a core-api response map.
func idOf(m map[string]any) string {
	if v, ok := m["id"].(string); ok {
		return v
	}
	return ""
}

// pricingAudit captures the salient, non-sensitive fields for the audit log.
// Pricing rules carry no secrets; rate/flat are operator policy and are recorded
// for accountability.
func pricingAudit(body, result map[string]any) map[string]any {
	out := map[string]any{}
	for _, k := range []string{"rule_key", "environment", "business_category", "transaction_type",
		"pricing_profile", "fee_policy_ref", "currency", "rate_bps", "flat_minor", "min_fee_minor",
		"max_fee_minor", "rounding", "priority"} {
		if v, ok := body[k]; ok {
			out[k] = v
		}
	}
	if result != nil {
		out["resulting_id"] = idOf(result)
		if v, ok := result["version"]; ok {
			out["version"] = v
		}
	}
	return out
}
