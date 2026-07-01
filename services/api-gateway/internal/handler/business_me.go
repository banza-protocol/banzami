package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// BusinessMeHandler serves the authenticated Business account its own
// consolidated profile — identity, account type, category, wallet readiness and
// KYB status — so an integrating application (e.g. DOA) can render an accurate
// "Integration Health" surface instead of guessing from local env vars.
//
// This is deliberately a SELF endpoint: the merchant id comes from the token,
// never from the path or a query. It is not a handle-enumeration oracle and it
// returns only non-secret fields.
type BusinessMeHandler struct {
	svc *service.BusinessSelfService
}

func NewBusinessMeHandler(svc *service.BusinessSelfService) *BusinessMeHandler {
	return &BusinessMeHandler{svc: svc}
}

// GET /v1/business/me
func (h *BusinessMeHandler) Me(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "business profile is not available")
		return
	}

	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "valid business credentials required")
		return
	}

	p, err := h.svc.Self(r.Context(), principal.MerchantID)
	if err != nil {
		if errors.Is(err, service.ErrMerchantNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "business account not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load business profile")
		return
	}

	env := "LIVE"
	if strings.EqualFold(strings.TrimSpace(principal.Environment), "SANDBOX") {
		env = "SANDBOX"
	}

	// settlement_ready = the account can actually receive money and be settled:
	// active + KYB approved + a wallet exists. This mirrors the ACTIVE+KYB gate
	// the settlement/wallet-account handlers enforce, surfaced for the UI.
	settlementReady := strings.EqualFold(p.Status, string(service.MerchantStatusActive)) &&
		p.Verified && p.WalletReady

	writeJSON(w, http.StatusOK, map[string]any{
		"environment":           env,
		"id":                    p.MerchantID,
		"handle":                p.Handle,
		"business_name":         p.BusinessName,
		"business_account_type": p.BusinessAccountType,
		"status":                p.Status,
		"kyb_status":            p.KybStatus,
		"verified":              p.Verified,
		"category":              p.Category,
		"wallet_ready":          p.WalletReady,
		"settlement_ready":      settlementReady,
	})
}
