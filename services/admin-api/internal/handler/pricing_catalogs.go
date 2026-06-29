package handler

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// PricingCatalogHandler manages a reference catalog (pricing profiles OR fee
// policies; Banzami ADR-021). Catalogs carry NO percentages — fee values live
// only in pricing_rules. Read = pricing.view; mutations = pricing.manage, audited.
type PricingCatalogHandler struct {
	core     *service.CoreAdminClient
	resource string // "pricing-profiles" | "fee-policies"
	entity   string // audit entity type
}

func NewPricingProfileHandler(core *service.CoreAdminClient) *PricingCatalogHandler {
	return &PricingCatalogHandler{core: core, resource: "pricing-profiles", entity: "pricing_profile"}
}

func NewFeePolicyHandler(core *service.CoreAdminClient) *PricingCatalogHandler {
	return &PricingCatalogHandler{core: core, resource: "fee-policies", entity: "fee_policy"}
}

func (h *PricingCatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := url.Values{}
	for _, k := range []string{"environment", "status", "code", "limit"} {
		if v := r.URL.Query().Get(k); v != "" {
			q.Set(k, v)
		}
	}
	result, err := h.core.ListCatalog(r.Context(), h.resource, q.Encode())
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *PricingCatalogHandler) Get(w http.ResponseWriter, r *http.Request) {
	result, err := h.core.GetCatalog(r.Context(), h.resource, chi.URLParam(r, "id"))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *PricingCatalogHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	result, err := h.core.CreateCatalog(r.Context(), h.resource, body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, h.entity, idOf(result), catalogAudit(body))
	writeJSON(w, http.StatusCreated, result)
}

func (h *PricingCatalogHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	result, err := h.core.UpdateCatalog(r.Context(), h.resource, id, body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditChange(r, h.entity, id, map[string]any{"id": id}, catalogAudit(body))
	writeJSON(w, http.StatusOK, result)
}

func (h *PricingCatalogHandler) Disable(w http.ResponseWriter, r *http.Request) { h.setEnabled(w, r, false) }
func (h *PricingCatalogHandler) Enable(w http.ResponseWriter, r *http.Request)  { h.setEnabled(w, r, true) }

func (h *PricingCatalogHandler) setEnabled(w http.ResponseWriter, r *http.Request, enabled bool) {
	id := chi.URLParam(r, "id")
	result, err := h.core.SetCatalogEnabled(r.Context(), h.resource, id, enabled)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, h.entity, id, map[string]any{"id": id, "enabled": enabled})
	writeJSON(w, http.StatusOK, result)
}

// catalogAudit captures the non-sensitive descriptive fields. Catalogs carry no
// secrets and no percentages.
func catalogAudit(body map[string]any) map[string]any {
	out := map[string]any{}
	for _, k := range []string{"code", "name", "environment"} {
		if v, ok := body[k]; ok {
			out[k] = v
		}
	}
	return out
}
