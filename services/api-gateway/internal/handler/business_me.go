package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// BusinessMeHandler serves the authenticated Business account its own
// consolidated resolution — identity, KYB, category/pricing, wallet and
// settlement readiness (with machine-readable blockers) — so an integrating
// application (e.g. DOA) renders an accurate "Integration Health" surface
// instead of guessing from local env vars.
//
// Self-scoped: the merchant id comes from the token, never from path/query.
// Not a handle-enumeration oracle; returns only non-secret fields.
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

	env := "LIVE"
	if strings.EqualFold(strings.TrimSpace(principal.Environment), "SANDBOX") {
		env = "SANDBOX"
	}

	slog.InfoContext(r.Context(), "business_resolution_started",
		"merchant_id", principal.MerchantID, "environment", env)

	res, err := h.svc.Self(r.Context(), principal.MerchantID, env)
	if err != nil {
		if errors.Is(err, service.ErrMerchantNotFound) {
			slog.WarnContext(r.Context(), "business_resolution_failed",
				"merchant_id", principal.MerchantID, "reason", "not_found")
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "business account not found")
			return
		}
		slog.ErrorContext(r.Context(), "business_resolution_failed",
			"merchant_id", principal.MerchantID, "error", err.Error())
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load business profile")
		return
	}

	if res.SettlementReady {
		slog.InfoContext(r.Context(), "business_resolution_success",
			"merchant_id", res.MerchantID, "handle", res.Handle, "kyb", res.KybStatus)
	} else {
		slog.InfoContext(r.Context(), "business_resolution_blocked",
			"merchant_id", res.MerchantID, "handle", res.Handle, "blockers", strings.Join(res.Blockers, ","))
	}

	// Empty slices must serialise as [] not null.
	blockers := res.Blockers
	if blockers == nil {
		blockers = []string{}
	}
	warnings := res.Warnings
	if warnings == nil {
		warnings = []string{}
	}

	var pricingCategory any
	if res.PricingCategory != "" {
		pricingCategory = res.PricingCategory
	}
	var category any
	if res.CategoryLabel != "" {
		category = res.CategoryLabel
	}
	var subcategory any
	if res.Subcategory != "" {
		subcategory = res.Subcategory
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"environment":           env,
		"id":                    res.MerchantID,
		"handle":                res.Handle,
		"business_name":         res.BusinessName,
		"business_account_type": res.BusinessAccountType,
		"status":                res.Status,
		"kyb_status":            res.KybStatus,
		"verified":              res.Verified,

		// Flat fields (back-compat with earlier clients).
		"category":         category,
		"wallet_ready":     res.WalletReady,
		"settlement_ready": res.SettlementReady,
		"pricing_category": pricingCategory,
		"subcategory":      subcategory,

		"pricing": map[string]any{
			"category": pricingCategory,
			"profile":  res.PricingProfile,
			"rule_key": res.PricingRuleKey,
			"fee_bps":  res.PricingRuleBps,
			"found":    res.PricingFound,
		},
		"wallet": map[string]any{
			"ready":                  res.WalletReady,
			"wallet_id":              res.WalletID,
			"currency":               res.WalletCurrency,
			"status":                 res.WalletStatus,
			"primary_account_id":     res.PrimaryAccountID,
			"application_account_id": res.ApplicationAccountID,
		},
		"settlement": map[string]any{
			"ready":    res.SettlementReady,
			"enabled":  true,
			"blockers": blockers,
		},
		"blockers": blockers,
		"warnings": warnings,
	})
}
