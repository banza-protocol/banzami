package handler

import (
	"encoding/json"
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ReconciliationHandler triggers reconciliation runs against external statements.
type ReconciliationHandler struct {
	core *service.CoreAdminClient
}

func NewReconciliationHandler(core *service.CoreAdminClient) *ReconciliationHandler {
	return &ReconciliationHandler{core: core}
}

// Run handles POST /admin/v1/reconciliation/run.
// Body must include merchant_id, period_start, period_end and the external statement lines.
func (h *ReconciliationHandler) Run(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
			return
		}
	}
	if body == nil {
		body = map[string]any{}
	}

	result, err := h.core.RunReconciliation(r.Context(), body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
