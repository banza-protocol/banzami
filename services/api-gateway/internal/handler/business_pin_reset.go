package handler

// POST /internal/v1/businesses/{merchantID}/app-pin-reset — admin-api only.
//
// An operator resets a Business's app PIN from BANZADMIN (audited there). The
// answer carries a single-use activation token once; admin-api turns it into
// the link it emails to the Business (and shows the operator in the Sandbox).

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type businessPinResetter interface {
	Reset(ctx context.Context, merchantID string, ttl time.Duration) (service.PinReset, error)
}

type BusinessPinResetHandler struct{ svc businessPinResetter }

func NewBusinessPinResetHandler(svc businessPinResetter) *BusinessPinResetHandler {
	return &BusinessPinResetHandler{svc: svc}
}

func (h *BusinessPinResetHandler) Reset(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "pin reset is not available")
		return
	}
	res, err := h.svc.Reset(r.Context(), chi.URLParam(r, "merchantID"), approvalActivationTTL)
	switch {
	case errors.Is(err, service.ErrPinResetNoLogin):
		apierror.Respond(w, r, http.StatusNotFound, "NO_APP_LOGIN", "this business has no activated app login")
	case errors.Is(err, service.ErrPinResetNotActive):
		apierror.Respond(w, r, http.StatusConflict, "BUSINESS_NOT_ACTIVE", "only an active business can be given a new PIN")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not reset the pin")
	default:
		slog.InfoContext(r.Context(), "business.app_pin_reset.issued", "merchant_id", res.MerchantID)
		writeJSON(w, http.StatusOK, res)
	}
}
