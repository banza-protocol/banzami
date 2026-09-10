package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
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
//
// ADR-028: classify a Business Account. The class decides whether it may take an
// application fee — only APPLICATION and PLATFORM may — so it is a commercial
// decision of the same weight as the pricing profile, and gets the same shape:
// the type is typed back to confirm, a reason is required, and the before/after
// lands in the audit trail. It used to be a bare setter with none of the three,
// and nothing in the console reached it, so the one way an operator could make
// an application eligible for its fee was an unaudited internal call.
//
// Generic by construction: the account is named by id, never by handle or
// tenant, and the same rule applies to every Business. A developer cannot reach
// this — it is an operator route behind CapMerchantManage.
func (h *MerchantHandler) SetBusinessAccountType(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		BusinessAccountType string `json:"business_account_type"`
		ConfirmationText    string `json:"confirmation_text"`
		Reason              string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	accountType := strings.ToUpper(strings.TrimSpace(body.BusinessAccountType))
	if accountType == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "business_account_type is required")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		writeError(w, http.StatusBadRequest, "REASON_REQUIRED",
			"a reason is required to change what a Business Account is permitted to receive")
		return
	}
	if strings.ToUpper(strings.TrimSpace(body.ConfirmationText)) != accountType {
		writeError(w, http.StatusBadRequest, "CONFIRMATION_MISMATCH",
			"confirmation text must be the account type — nothing was changed")
		return
	}

	// Read the current class first, so the audit row says what it changed FROM.
	var before any
	if cur, err := h.core.GetMerchant(r.Context(), id); err == nil {
		before = cur["business_account_type"]
	}

	// Core validates the type against the ADR-028 taxonomy and refuses anything
	// else; this layer does not keep a second list that could disagree with it.
	result, err := h.core.SetMerchantBusinessAccountType(r.Context(), id, accountType)
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = "MERCHANT_BUSINESS_ACCOUNT_TYPE_CHANGED"
		a.EntityType = "merchant"
		a.EntityID = id
		a.Before = map[string]any{"business_account_type": before}
		a.After = map[string]any{"business_account_type": accountType, "reason": body.Reason}
	})
	writeJSON(w, http.StatusOK, result)
}

// AssignPricingProfile handles PUT /admin/v1/merchants/{id}/pricing-profile.
//
// The operator could set a Business Account's verified flag and its account type
// from here, but not what it is charged — the one commercial decision the
// operator actually makes about a customer. The core route existed; nothing
// operator-facing reached it, so the only way to price a customer was to call an
// internal service route by hand.
//
// A pricing profile is the whole answer to "what does this customer pay": the
// model resolves exactly one rule from (assigned profile, operation), and a
// merchant with no profile resolves nothing at all. So this is deliberately not
// a one-click control. It follows the platform-mode shape — type the profile
// code to confirm, give a reason, and the before/after lands in the audit trail
// — because a rate changed by accident is not visible in any balance until an
// invoice is wrong.
func (h *MerchantHandler) AssignPricingProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		ProfileCode      string `json:"profile_code"`
		ConfirmationText string `json:"confirmation_text"`
		Reason           string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON")
		return
	}
	code := strings.TrimSpace(body.ProfileCode)
	if code == "" {
		writeError(w, http.StatusBadRequest, "MISSING_FIELD", "profile_code is required")
		return
	}
	if strings.TrimSpace(body.Reason) == "" {
		// The reason is the only part of this that survives as an explanation.
		// Core records the assignment; nothing else records why.
		writeError(w, http.StatusBadRequest, "REASON_REQUIRED", "a reason is required to change what a customer is charged")
		return
	}
	if strings.TrimSpace(body.ConfirmationText) != code {
		writeError(w, http.StatusBadRequest, "CONFIRMATION_MISMATCH",
			"confirmation text must be the profile code — nothing was changed")
		return
	}

	// Read the current profile first, so the audit row says what it changed FROM.
	// Best-effort: a customer that cannot be read here is one core will refuse
	// anyway, and failing the change because the before-state was unavailable
	// would be the wrong trade.
	var before any
	if cur, err := h.core.GetMerchant(r.Context(), id); err == nil {
		before = cur["pricing_profile_id"]
	}

	result, err := h.core.AssignMerchantPricingProfile(r.Context(), id, code)
	if err != nil {
		handleCoreErr(w, err)
		return
	}

	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = "MERCHANT_PRICING_PROFILE_ASSIGNED"
		a.EntityType = "merchant"
		a.EntityID = id
		a.Before = map[string]any{"pricing_profile_id": before}
		a.After = map[string]any{"profile_code": code, "reason": body.Reason}
	})
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
