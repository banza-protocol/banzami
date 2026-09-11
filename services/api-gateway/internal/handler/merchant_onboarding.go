package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/jackc/pgx/v5/pgconn"
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
}

func NewMerchantOnboardingHandler(apps service.MerchantApplicationService, activation service.ActivationService, gate *service.EnvGate) *MerchantOnboardingHandler {
	return &MerchantOnboardingHandler{apps: apps, activation: activation, gate: gate}
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
		TermsAccepted       bool   `json:"terms_accepted"`
		// The applicant says the requested @handle is already their Business's.
		// No handle is held; an operator resolves the application by linking it
		// to that Business, never by creating another.
		ExistingBusiness bool `json:"existing_business"`
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
		TermsAccepted:       body.TermsAccepted,
		ExistingBusiness:    body.ExistingBusiness,
		// One key per form session: a double click or a retried request returns
		// the application the first one created.
		IdempotencyKey: r.Header.Get("Idempotency-Key"),
		// The public form. A Project's application comes through the Developer
		// Platform, never through this route: nothing here can attach one.
		Origin: service.ApplicationOriginStandalone,
	})
	switch {
	case err == nil:
		observeApplication(appActionSubmit, appResultOK)
	case errors.Is(err, service.ErrHandleInvalid), errors.Is(err, service.ErrApplicationIncomplete),
		errors.Is(err, service.ErrHandleReserved), errors.Is(err, service.ErrMerchantHandleTaken),
		errors.Is(err, service.ErrHandleOwnedByBusiness), errors.Is(err, service.ErrExistingBusinessNotFound):
		observeApplication(appActionSubmit, appResultRefused)
	default:
		observeApplication(appActionSubmit, appResultFailed)
	}
	switch {
	case errors.Is(err, service.ErrHandleInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
	case errors.Is(err, service.ErrApplicationIncomplete):
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "business name, email and terms acceptance are required")
	case errors.Is(err, service.ErrHandleReserved):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_RESERVED", "this handle is reserved")
	case errors.Is(err, service.ErrMerchantHandleTaken):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "this handle is no longer available")
	case errors.Is(err, service.ErrHandleOwnedByBusiness):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_OWNED_BY_BUSINESS",
			"a Business Account already uses this handle; if it is yours, apply to regularise it")
	case errors.Is(err, service.ErrExistingBusinessNotFound):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_NOT_A_BUSINESS",
			"no Business Account uses this handle; apply for it as a new Business")
	case err != nil:
		// The public response stays exactly as it was — a generic INTERNAL_ERROR
		// with a request id, leaking no SQL, constraint name or column. The
		// operator-side log is what changes: a 500 with no log line is not
		// diagnosable from outside, and this one was reproduced from the public
		// Internet for two stages before anyone could say which operation failed.
		//
		// Logged: the operation, the error class and the driver's error CODE where
		// PostgreSQL supplies one. A SQLSTATE identifies the failure class
		// (undefined_column, not_null_violation, foreign_key_violation …) without
		// carrying row data. The raw message can quote submitted values, so it is
		// deliberately not logged here — the code plus the constraint name is what
		// distinguishes causes.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			slog.ErrorContext(r.Context(), "merchant.application.submit_failed",
				"stage", "persist",
				"error_kind", "postgres",
				"sqlstate", pgErr.Code,
				"constraint", pgErr.ConstraintName,
				"column", pgErr.ColumnName,
				"table", pgErr.TableName)
		} else {
			slog.ErrorContext(r.Context(), "merchant.application.submit_failed",
				"stage", "persist",
				"error_kind", fmt.Sprintf("%T", err))
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not submit application")
	default:
		slog.InfoContext(r.Context(), "merchant.application.submitted", "application_id", obs.MaskID(appID))

		// Every application is reviewed by an operator — in the Sandbox too. It
		// used to be approved here, on submit, before a single document had been
		// uploaded: 29 Sandbox Businesses exist with no reviewed evidence at all,
		// and the approval that provisioned them was nobody's decision.
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
