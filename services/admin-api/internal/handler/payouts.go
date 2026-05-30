package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/admin-api/internal/service"
)

// PayoutHandler manages the admin-side payout lifecycle.
type PayoutHandler struct {
	core *service.CoreAdminClient
}

func NewPayoutHandler(core *service.CoreAdminClient) *PayoutHandler {
	return &PayoutHandler{core: core}
}

// Get handles GET /admin/v1/payouts/{id}.
func (h *PayoutHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetPayout(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// List handles GET /admin/v1/payouts?merchant_id={id}.
func (h *PayoutHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "MISSING_PARAM", "merchant_id query parameter is required")
		return
	}
	result, err := h.core.ListPayouts(r.Context(), merchantID)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ListAll handles GET /admin/v1/payouts/all?status={optional}.
func (h *PayoutHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	result, err := h.core.ListAllPayouts(r.Context(), status)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Process handles POST /admin/v1/payouts/{id}/process.
// Transitions payout from Pending to Processing and posts the ledger entry.
func (h *PayoutHandler) Process(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.ProcessPayout(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// MarkSent handles POST /admin/v1/payouts/{id}/sent.
// Marks payout as Sent after the bank transfer has been dispatched.
func (h *PayoutHandler) MarkSent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.MarkPayoutSent(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Confirm handles POST /admin/v1/payouts/{id}/confirm.
// Marks payout as Confirmed once bank acknowledges receipt.
func (h *PayoutHandler) Confirm(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.ConfirmPayout(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Fail handles POST /admin/v1/payouts/{id}/fail.
func (h *PayoutHandler) Fail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Reason == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "reason is required")
		return
	}
	result, err := h.core.FailPayout(r.Context(), id, body.Reason)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// MarkReturned handles POST /admin/v1/payouts/{id}/returned.
// Records bank return (e.g. invalid account) and reverses the ledger entry.
func (h *PayoutHandler) MarkReturned(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.MarkPayoutReturned(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
