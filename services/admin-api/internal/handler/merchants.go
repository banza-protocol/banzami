package handler

import (
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
