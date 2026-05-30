package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/admin-api/internal/service"
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

// Delete handles DELETE /admin/v1/merchants/{id}.
func (h *MerchantHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.core.DeleteMerchant(r.Context(), id); err != nil {
		handleCoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
