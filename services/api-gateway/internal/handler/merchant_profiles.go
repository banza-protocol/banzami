package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type MerchantProfileHandler struct {
	svc service.MerchantProfileService
}

func NewMerchantProfileHandler(svc service.MerchantProfileService) *MerchantProfileHandler {
	return &MerchantProfileHandler{svc: svc}
}

// GET /public/profiles/{handle}
func (h *MerchantProfileHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	handle := chi.URLParam(r, "handle")
	if handle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "MISSING_PARAM", "handle is required")
		return
	}

	profile, err := h.svc.GetByHandle(r.Context(), handle)
	if err != nil {
		if errors.Is(err, service.ErrMerchantProfileNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "merchant profile not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not fetch merchant profile")
		return
	}

	respond(w, http.StatusOK, publicMerchantProfile{MerchantProfile: profile})
}

// publicMerchantProfile is a Business's public page without the internal ids a
// stranger has no use for — they are what id-selector defects need (A6-07).
type publicMerchantProfile struct {
	*service.MerchantProfile
	ID         *struct{} `json:"id,omitempty"`
	MerchantID *struct{} `json:"merchant_id,omitempty"`
	WalletID   *struct{} `json:"wallet_id,omitempty"`
}
