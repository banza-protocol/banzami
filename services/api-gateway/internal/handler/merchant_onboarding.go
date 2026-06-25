package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantOnboardingHandler exposes the PUBLIC Business onboarding endpoints:
// handle availability + application submission (Track 1) and account activation
// (Track 4). None require auth. No secret (PIN/token/key) is ever returned.
type MerchantOnboardingHandler struct {
	apps       service.MerchantApplicationService
	activation service.ActivationService
}

func NewMerchantOnboardingHandler(apps service.MerchantApplicationService, activation service.ActivationService) *MerchantOnboardingHandler {
	return &MerchantOnboardingHandler{apps: apps, activation: activation}
}

// POST /v1/merchant/applications/check-handle   {handle}
func (h *MerchantOnboardingHandler) CheckHandle(w http.ResponseWriter, r *http.Request) {
	if h.apps == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "onboarding is not available")
		return
	}
	var body struct {
		Handle string `json:"handle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Handle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "handle is required")
		return
	}
	available, reason, err := h.apps.CheckHandle(r.Context(), body.Handle)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not check handle")
		return
	}
	// A malformed handle is a client error (consistent with the lookup endpoint).
	if !available && reason == service.HandleReasonInvalid {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
		return
	}
	out := map[string]any{"available": available}
	if !available {
		out["reason"] = reason
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /v1/merchant/applications   {business fields}
func (h *MerchantOnboardingHandler) SubmitApplication(w http.ResponseWriter, r *http.Request) {
	if h.apps == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "onboarding is not available")
		return
	}
	var body struct {
		Environment         string `json:"environment"`
		DesiredHandle       string `json:"desired_handle"`
		BusinessName        string `json:"business_name"`
		Category            string `json:"category"`
		Email               string `json:"email"`
		Phone               string `json:"phone"`
		Nif                 string `json:"nif"`
		Country             string `json:"country"`
		City                string `json:"city"`
		Address             string `json:"address"`
		LegalRepresentative string `json:"legal_representative"`
		BusinessActivity    string `json:"business_activity"`
		EstimatedVolume     string `json:"estimated_volume"`
		TermsAccepted       bool   `json:"terms_accepted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	appID, err := h.apps.Submit(r.Context(), service.MerchantApplicationInput{
		Environment:         body.Environment,
		DesiredHandle:       body.DesiredHandle,
		BusinessName:        body.BusinessName,
		Category:            body.Category,
		Email:               body.Email,
		Phone:               body.Phone,
		Nif:                 body.Nif,
		Country:             body.Country,
		City:                body.City,
		Address:             body.Address,
		LegalRepresentative: body.LegalRepresentative,
		BusinessActivity:    body.BusinessActivity,
		EstimatedVolume:     body.EstimatedVolume,
		TermsAccepted:       body.TermsAccepted,
	})
	switch {
	case errors.Is(err, service.ErrHandleInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
	case errors.Is(err, service.ErrApplicationIncomplete):
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "business name, email and terms acceptance are required")
	case errors.Is(err, service.ErrHandleReserved):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_RESERVED", "this handle is reserved")
	case errors.Is(err, service.ErrMerchantHandleTaken):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "this handle is no longer available")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not submit application")
	default:
		slog.InfoContext(r.Context(), "merchant.application.submitted", "application_id", appID)
		writeJSON(w, http.StatusCreated, map[string]any{"application_id": appID, "status": "SUBMITTED"})
	}
}

// POST /v1/merchant/activation/validate   {token}
func (h *MerchantOnboardingHandler) ValidateActivation(w http.ResponseWriter, r *http.Request) {
	if h.activation == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "activation is not available")
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "token is required")
		return
	}
	st, err := h.activation.Validate(r.Context(), body.Token)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not validate token")
		return
	}
	out := map[string]any{"valid": st.Valid, "reason": st.Reason}
	if st.Valid {
		out["business_name"] = st.BusinessName
		out["handle"] = st.Handle
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /v1/merchant/activation/complete   {token, pin}
func (h *MerchantOnboardingHandler) CompleteActivation(w http.ResponseWriter, r *http.Request) {
	if h.activation == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "activation is not available")
		return
	}
	var body struct {
		Token string `json:"token"`
		Pin   string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" || body.Pin == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "token and pin are required")
		return
	}
	err := h.activation.Complete(r.Context(), body.Token, body.Pin)
	switch {
	case errors.Is(err, service.ErrPinInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PIN", "pin must be 4-8 digits")
	case errors.Is(err, service.ErrActivationExpired):
		apierror.Respond(w, r, http.StatusGone, "TOKEN_EXPIRED", "this activation link has expired")
	case errors.Is(err, service.ErrActivationUsed):
		apierror.Respond(w, r, http.StatusGone, "TOKEN_USED", "this activation link has already been used")
	case errors.Is(err, service.ErrActivationInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "TOKEN_INVALID", "this activation link is invalid")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not activate account")
	default:
		// Never log the PIN or token.
		slog.InfoContext(r.Context(), "merchant.activation.completed")
		writeJSON(w, http.StatusOK, map[string]any{"status": "activated"})
	}
}

// activationTokenTTL is the default lifetime of an activation link.
const activationTokenTTL = 72 * time.Hour
