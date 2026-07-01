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
	gate       *service.EnvGate
	// admin is used ONLY for SANDBOX assisted onboarding (auto-approve). Optional:
	// when nil, applications are simply created SUBMITTED (manual review).
	admin service.MerchantApplicationAdminService
}

// sandboxAutoApproveTTL is the activation-link lifetime for a sandbox auto-approved
// account — generous, since sandbox accounts are for extended testing.
const sandboxAutoApproveTTL = 30 * 24 * time.Hour

func NewMerchantOnboardingHandler(apps service.MerchantApplicationService, activation service.ActivationService, gate *service.EnvGate) *MerchantOnboardingHandler {
	return &MerchantOnboardingHandler{apps: apps, activation: activation, gate: gate}
}

// WithAutoApprove enables SANDBOX assisted onboarding (auto-approve + provision).
// Left unset in tests / environments that shouldn't auto-approve.
func (h *MerchantOnboardingHandler) WithAutoApprove(admin service.MerchantApplicationAdminService) *MerchantOnboardingHandler {
	h.admin = admin
	return h
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
		Subcategory         string `json:"subcategory"`
		Email               string `json:"email"`
		Phone               string `json:"phone"`
		Nif                 string `json:"nif"`
		Country             string `json:"country"`
		Province            string `json:"province"`
		Municipality        string `json:"municipality"`
		City                string `json:"city"`
		Address             string `json:"address"`
		AddressReference    string `json:"address_reference"`
		LegalRepresentative string `json:"legal_representative"`
		RepresentativeRole  string `json:"representative_role"`
		RepresentativeEmail string `json:"representative_email"`
		RepresentativePhone string `json:"representative_phone"`
		BusinessActivity    string `json:"business_activity"`
		EstimatedVolume     string `json:"estimated_volume"`
		BusinessAccountType string `json:"business_account_type"`
		TermsAccepted       bool   `json:"terms_accepted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	// Platform Mode is the single source of truth for the onboarding environment
	// (ADR-025). Refuse submission when this gateway stack does not match the
	// current platform mode, and stamp the environment from the stack — never
	// from the client body — so a merchant can never be created in an environment
	// the platform is not operating in.
	mode, gerr := h.gate.Verify(r.Context())
	if errors.Is(gerr, service.ErrEnvMismatch) {
		apierror.Respond(w, r, http.StatusConflict, "ENVIRONMENT_MISMATCH",
			"onboarding is unavailable here because the platform is currently in "+mode+" mode")
		return
	}
	env := body.Environment
	if se := h.gate.StackEnv(); se != "" {
		env = se
	}

	appID, err := h.apps.Submit(r.Context(), service.MerchantApplicationInput{
		Environment:         env,
		DesiredHandle:       body.DesiredHandle,
		BusinessName:        body.BusinessName,
		Category:            body.Category,
		Subcategory:         body.Subcategory,
		Email:               body.Email,
		Phone:               body.Phone,
		Nif:                 body.Nif,
		Country:             body.Country,
		Province:            body.Province,
		Municipality:        body.Municipality,
		City:                body.City,
		Address:             body.Address,
		AddressReference:    body.AddressReference,
		LegalRepresentative: body.LegalRepresentative,
		RepresentativeRole:  body.RepresentativeRole,
		RepresentativeEmail: body.RepresentativeEmail,
		RepresentativePhone: body.RepresentativePhone,
		BusinessActivity:    body.BusinessActivity,
		EstimatedVolume:     body.EstimatedVolume,
		BusinessAccountType: body.BusinessAccountType,
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

		// SANDBOX assisted onboarding: auto-approve + provision immediately so the
		// account is testable without manual review. Best-effort — if provisioning
		// fails the application stays SUBMITTED and can be approved manually.
		//
		// NEVER in LIVE: `env` is stamped from the stack (StackEnv), not the client,
		// and the service itself refuses any non-SANDBOX application — a LIVE stack
		// can never reach or trigger auto-approval.
		if env == "SANDBOX" && h.admin != nil {
			res, aerr := h.admin.AutoApproveSandbox(r.Context(), appID, sandboxAutoApproveTTL)
			if aerr != nil {
				slog.WarnContext(r.Context(), "merchant.application.sandbox_auto_approve_failed",
					"application_id", appID, "error", aerr.Error())
				writeJSON(w, http.StatusCreated, map[string]any{"application_id": appID, "status": "SUBMITTED"})
				return
			}
			slog.InfoContext(r.Context(), "merchant.application.sandbox_auto_approved",
				"application_id", appID, "merchant_id", res.MerchantID)
			// The raw activation token is returned ONLY in sandbox, so the tester can
			// self-activate (set a PIN) without waiting for the email — the applicant
			// owns this test account and no real money is involved.
			writeJSON(w, http.StatusCreated, map[string]any{
				"application_id":        appID,
				"status":                "APPROVED",
				"sandbox_auto_approved": true,
				"merchant_id":           res.MerchantID,
				"activation_token":      res.ActivationToken,
			})
			return
		}

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
