package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// RiskHandler exposes freeze/unfreeze, risk flags, audit log, and
// acquiring reconciliation endpoints to the admin dashboard.
type RiskHandler struct {
	core *service.CoreAdminClient
}

func NewRiskHandler(core *service.CoreAdminClient) *RiskHandler {
	return &RiskHandler{core: core}
}

// ---------------------------------------------------------------------------
// Freeze / Unfreeze
// ---------------------------------------------------------------------------

type freezeBody struct {
	EntityType string `json:"entity_type"`
	EntityID   string `json:"entity_id"`
	Reason     string `json:"reason"`
}

// FreezeAccount handles POST /admin/v1/risk/freeze.
func (h *RiskHandler) FreezeAccount(w http.ResponseWriter, r *http.Request) {
	var body freezeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.EntityType == "" || body.EntityID == "" || body.Reason == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "entity_type, entity_id and reason are required")
		return
	}

	out, err := h.core.FreezeAccount(r.Context(), body.EntityType, body.EntityID, body.Reason, "ADMIN")
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "risk_freeze", body.EntityID, map[string]any{
		"entity_type": body.EntityType, "entity_id": body.EntityID, "action": "FREEZE", "reason": body.Reason,
	})
	writeJSON(w, http.StatusCreated, out)
}

// UnfreezeAccount handles DELETE /admin/v1/risk/freeze/{entity_type}/{entity_id}.
func (h *RiskHandler) UnfreezeAccount(w http.ResponseWriter, r *http.Request) {
	entityType := chi.URLParam(r, "entity_type")
	entityID := chi.URLParam(r, "entity_id")

	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "reason is required")
		return
	}

	out, err := h.core.UnfreezeAccount(r.Context(), entityType, entityID, body.Reason, "ADMIN")
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "risk_freeze", entityID, map[string]any{
		"entity_type": entityType, "entity_id": entityID, "action": "UNFREEZE", "reason": body.Reason,
	})
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

// ListRiskFlags handles GET /admin/v1/risk/flags?resolved=false.
func (h *RiskHandler) ListRiskFlags(w http.ResponseWriter, r *http.Request) {
	resolved := r.URL.Query().Get("resolved") == "true"
	flags, err := h.core.ListRiskFlags(r.Context(), resolved)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	if flags == nil {
		flags = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": flags})
}

type resolveRiskFlagBody struct {
	Resolution string `json:"resolution"` // APPROVED | REJECTED
	ResolvedBy string `json:"resolved_by"`
}

// ResolveRiskFlag handles POST /admin/v1/risk/flags/{id}/resolve.
func (h *RiskHandler) ResolveRiskFlag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body resolveRiskFlagBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	if body.Resolution != "APPROVED" && body.Resolution != "REJECTED" {
		writeError(w, http.StatusBadRequest, "INVALID_RESOLUTION", "resolution must be APPROVED or REJECTED")
		return
	}
	// Attribution from the authenticated operator (ignores any client value).
	res, err := h.core.ResolveRiskFlag(r.Context(), id, body.Resolution, actorOf(r))
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	auditAfter(r, "risk_flag", id, map[string]any{"risk_flag_id": id, "resolution": body.Resolution})
	writeJSON(w, http.StatusOK, res)
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

// QueryAuditLog handles GET /admin/v1/risk/audit-log.
// Query params: subject, actor, action, limit (default 100).
func (h *RiskHandler) QueryAuditLog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 100
	if raw := q.Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}
	entries, err := h.core.QueryAuditLog(r.Context(), q.Get("subject"), q.Get("actor"), q.Get("action"), limit)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	if entries == nil {
		entries = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": entries})
}

// ---------------------------------------------------------------------------
// Acquiring reconciliation
// ---------------------------------------------------------------------------

// RunAcquiringReconciliation handles POST /admin/v1/risk/acquiring-recon.
func (h *RiskHandler) RunAcquiringReconciliation(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	out, err := h.core.RunAcquiringReconciliation(r.Context(), date)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// ListAcquiringReconciliationRuns handles GET /admin/v1/risk/acquiring-recon.
func (h *RiskHandler) ListAcquiringReconciliationRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.core.ListAcquiringReconciliationRuns(r.Context())
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	if runs == nil {
		runs = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": runs})
}

// GetAcquiringReconciliationRun handles GET /admin/v1/risk/acquiring-recon/{id}.
func (h *RiskHandler) GetAcquiringReconciliationRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "id")
	out, err := h.core.GetAcquiringReconciliationRun(r.Context(), runID)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
