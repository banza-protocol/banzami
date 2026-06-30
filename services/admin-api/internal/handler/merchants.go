package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// MerchantHandler exposes read-only merchant views for the admin dashboard.
type MerchantHandler struct {
	core *service.CoreAdminClient
}

func NewMerchantHandler(core *service.CoreAdminClient) *MerchantHandler {
	return &MerchantHandler{core: core}
}

// List handles GET /admin/v1/merchants[?search=].
func (h *MerchantHandler) List(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	result, err := h.core.ListMerchants(r.Context(), search)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": result})
}

// Get handles GET /admin/v1/merchants/{id}.
func (h *MerchantHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.core.GetMerchant(r.Context(), id)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// SetVerified handles PATCH /admin/v1/merchants/{id}/verified.
func (h *MerchantHandler) SetVerified(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Verified bool `json:"verified"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	result, err := h.core.SetMerchantVerified(r.Context(), id, body.Verified)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// SetBusinessAccountType handles PATCH /admin/v1/merchants/{id}/business-account-type.
// ADR-028: re-tag a Business Account's operator type (e.g. mark @doa APPLICATION).
func (h *MerchantHandler) SetBusinessAccountType(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		BusinessAccountType string `json:"business_account_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.BusinessAccountType == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": map[string]any{"code": "MISSING_FIELD", "message": "business_account_type is required"},
		})
		return
	}
	result, err := h.core.SetMerchantBusinessAccountType(r.Context(), id, body.BusinessAccountType)
	if err != nil {
		handleCoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// Delete handles DELETE /admin/v1/merchants/{id}.
func (h *MerchantHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.core.DeleteMerchant(r.Context(), id); err != nil {
		handleCoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
