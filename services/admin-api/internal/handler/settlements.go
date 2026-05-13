package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// SettlementHandler manages the settlement lifecycle for the admin dashboard.
type SettlementHandler struct {
	core *service.CoreAdminClient
}

func NewSettlementHandler(core *service.CoreAdminClient) *SettlementHandler {
	return &SettlementHandler{core: core}
}

// CreateBatch handles POST /admin/v1/settlements.
// Creates a new settlement batch for a merchant's wallet covering a given period.
func (h *SettlementHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}

	result, err := h.core.CreateSettlementBatch(r.Context(), body)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// Get handles GET /admin/v1/settlements/{id}.
func (h *SettlementHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetSettlement(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// List handles GET /admin/v1/settlements?merchant_id={id}.
func (h *SettlementHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "MISSING_PARAM", "merchant_id query parameter is required")
		return
	}
	result, err := h.core.ListSettlements(r.Context(), merchantID)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Submit handles POST /admin/v1/settlements/{id}/submit.
// Transitions the settlement from Pending to Submitted (queued for acquirer).
func (h *SettlementHandler) Submit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.SubmitSettlement(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Confirm handles POST /admin/v1/settlements/{id}/confirm.
// Posts the double-entry ledger entry (DR bank / CR transit) and marks as Settled.
func (h *SettlementHandler) Confirm(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.ConfirmSettlement(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Fail handles POST /admin/v1/settlements/{id}/fail.
func (h *SettlementHandler) Fail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Reason == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "reason is required")
		return
	}
	result, err := h.core.FailSettlement(r.Context(), id, body.Reason)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
