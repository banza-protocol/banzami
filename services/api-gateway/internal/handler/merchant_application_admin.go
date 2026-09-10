package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantApplicationAdminHandler serves the INTERNAL application-lifecycle
// endpoints the admin-api calls (behind InternalAuth). The activation token is
// returned to the admin-api ONCE for the approved email and is never logged.
type MerchantApplicationAdminHandler struct {
	svc       service.MerchantApplicationAdminService
	gate      *service.EnvGate
	readiness service.SettlementReadinessService
}

func NewMerchantApplicationAdminHandler(svc service.MerchantApplicationAdminService, gate *service.EnvGate) *MerchantApplicationAdminHandler {
	return &MerchantApplicationAdminHandler{svc: svc, gate: gate}
}

// WithReadiness lets the Business-state view show core's settlement readiness.
func (h *MerchantApplicationAdminHandler) WithReadiness(r service.SettlementReadinessService) *MerchantApplicationAdminHandler {
	h.readiness = r
	return h
}

// respondLifecycleError maps the application-lifecycle refusals to precise
// codes an operator UI can explain.
func respondLifecycleError(w http.ResponseWriter, r *http.Request, err error, action string) {
	result := appResultRefused
	defer func() {
		if label, counted := lifecycleActionLabel[action]; counted {
			observeApplication(label, result)
		}
	}()
	switch {
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "application not found")
	case errors.Is(err, service.ErrApplicationNotOpen):
		apierror.Respond(w, r, http.StatusConflict, "NOT_OPEN", "application is not open for this action")
	case errors.Is(err, service.ErrRequiredDocumentsMissing):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "REQUIREMENTS_NOT_MET", err.Error())
	case errors.Is(err, service.ErrInformationRequestRequired):
		apierror.Respond(w, r, http.StatusBadRequest, "MESSAGE_REQUIRED", err.Error())
	case errors.Is(err, service.ErrHandleOwnedByBusiness):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_OWNED_BY_BUSINESS", err.Error())
	case errors.Is(err, service.ErrClaimsExistingBusiness):
		apierror.Respond(w, r, http.StatusConflict, "LINK_REQUIRED", err.Error())
	case errors.Is(err, service.ErrMerchantHandleTaken):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "the requested handle is held by someone else")
	case errors.Is(err, service.ErrLinkTargetInvalid):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_TARGET_INVALID", err.Error())
	case errors.Is(err, service.ErrLinkConfirmationMismatch):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "CONFIRMATION_MISMATCH", err.Error())
	case errors.Is(err, service.ErrApplicationNotLinkable):
		apierror.Respond(w, r, http.StatusConflict, "NOT_LINKABLE", err.Error())
	case errors.Is(err, service.ErrLinkReasonRequired):
		apierror.Respond(w, r, http.StatusBadRequest, "REASON_REQUIRED", err.Error())
	case errors.Is(err, service.ErrActivationNotReissuable):
		apierror.Respond(w, r, http.StatusConflict, "NO_PENDING_ACTIVATION", err.Error())
	default:
		result = appResultFailed
		slog.ErrorContext(r.Context(), "merchant.application."+action+".failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not "+action+" application")
	}
}

// activationTTL is the lifetime of an activation link issued at approval.
const approvalActivationTTL = 72 * time.Hour

func (h *MerchantApplicationAdminHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	apps, err := h.svc.List(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("environment"))
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list applications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"applications": apps})
}

func (h *MerchantApplicationAdminHandler) Get(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	app, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	switch {
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "application not found")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not load application")
	default:
		writeJSON(w, http.StatusOK, app)
	}
}

func (h *MerchantApplicationAdminHandler) Approve(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	var body struct {
		ReviewedBy string `json:"reviewed_by"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Refuse to provision a merchant on a stack that does not match the current
	// platform mode (ADR-025). Without this, a SUBMITTED LIVE application could be
	// approved into the LIVE database while the platform is globally in SANDBOX,
	// leaving a merchant the SANDBOX apps can never see.
	if mode, gerr := h.gate.Verify(r.Context()); errors.Is(gerr, service.ErrEnvMismatch) {
		apierror.Respond(w, r, http.StatusConflict, "ENVIRONMENT_MISMATCH",
			"cannot approve here because the platform is currently in "+mode+" mode")
		return
	}

	res, err := h.svc.Approve(r.Context(), chi.URLParam(r, "id"), body.ReviewedBy, approvalActivationTTL)
	if err != nil {
		respondLifecycleError(w, r, err, "approve")
		return
	}
	// merchant_id is safe to log; the activation token is NOT.
	slog.InfoContext(r.Context(), "merchant.application.approved",
		"application_id", res.ApplicationID, "merchant_id", res.MerchantID, "already_approved", res.AlreadyApproved)
	if res.AlreadyApproved {
		observeApplication(appActionApprove, appResultReplayed)
	} else {
		observeApplication(appActionApprove, appResultOK)
	}
	writeJSON(w, http.StatusOK, res)
}

func (h *MerchantApplicationAdminHandler) Reject(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	var body struct {
		ReviewedBy      string `json:"reviewed_by"`
		AdminNotes      string `json:"admin_notes"`
		MerchantMessage string `json:"merchant_message"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	res, err := h.svc.Reject(r.Context(), chi.URLParam(r, "id"), body.ReviewedBy, body.AdminNotes, body.MerchantMessage)
	if err != nil {
		respondLifecycleError(w, r, err, "reject")
		return
	}
	slog.InfoContext(r.Context(), "merchant.application.rejected", "application_id", res.ApplicationID)
	observeApplication(appActionReject, appResultOK)
	writeJSON(w, http.StatusOK, res)
}

// POST /internal/v1/merchant-applications/{id}/start-review {reviewed_by}
func (h *MerchantApplicationAdminHandler) StartReview(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	var body struct {
		ReviewedBy string `json:"reviewed_by"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	app, err := h.svc.StartReview(r.Context(), chi.URLParam(r, "id"), body.ReviewedBy)
	if err != nil {
		respondLifecycleError(w, r, err, "start review of")
		return
	}
	slog.InfoContext(r.Context(), "merchant.application.review_started", "application_id", app.ID)
	observeApplication(appActionStartReview, appResultOK)
	writeJSON(w, http.StatusOK, app)
}

// POST /internal/v1/merchant-applications/{id}/link-existing
// {merchant_id, confirmation_handle, reason, reviewed_by}
func (h *MerchantApplicationAdminHandler) LinkExisting(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	var body struct {
		MerchantID         string `json:"merchant_id"`
		ConfirmationHandle string `json:"confirmation_handle"`
		Reason             string `json:"reason"`
		ReviewedBy         string `json:"reviewed_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.MerchantID == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "merchant_id is required")
		return
	}
	if mode, gerr := h.gate.Verify(r.Context()); errors.Is(gerr, service.ErrEnvMismatch) {
		apierror.Respond(w, r, http.StatusConflict, "ENVIRONMENT_MISMATCH",
			"cannot link here because the platform is currently in "+mode+" mode")
		return
	}
	res, err := h.svc.LinkExisting(r.Context(), chi.URLParam(r, "id"), body.MerchantID, body.ConfirmationHandle, body.ReviewedBy, body.Reason)
	if err != nil {
		respondLifecycleError(w, r, err, "link")
		return
	}
	slog.InfoContext(r.Context(), "merchant.application.linked_existing",
		"application_id", res.ApplicationID, "merchant_id", res.MerchantID, "already_linked", res.AlreadyLinked)
	if res.AlreadyLinked {
		observeApplication(appActionLink, appResultReplayed)
	} else {
		observeApplication(appActionLink, appResultOK)
	}
	writeJSON(w, http.StatusOK, res)
}

// POST /internal/v1/merchant-applications/{id}/reissue-activation
func (h *MerchantApplicationAdminHandler) ReissueActivation(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	res, err := h.svc.ReissueActivation(r.Context(), chi.URLParam(r, "id"), approvalActivationTTL)
	if err != nil {
		respondLifecycleError(w, r, err, "reissue activation for")
		return
	}
	slog.InfoContext(r.Context(), "merchant.application.activation_reissued", "application_id", res.ApplicationID)
	observeApplication(appActionReissueActivation, appResultOK)
	writeJSON(w, http.StatusOK, res)
}

// GET /internal/v1/merchant-applications/{id}/link-candidates?handle=
func (h *MerchantApplicationAdminHandler) LinkCandidates(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	out, err := h.svc.LinkCandidates(r.Context(), chi.URLParam(r, "id"), r.URL.Query().Get("handle"))
	if err != nil {
		respondLifecycleError(w, r, err, "list candidates for")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"candidates": out})
}

// GET /internal/v1/merchant-applications/{id}/business-state
func (h *MerchantApplicationAdminHandler) BusinessState(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	st, err := h.svc.BusinessState(r.Context(), chi.URLParam(r, "id"), h.readiness)
	if err != nil {
		respondLifecycleError(w, r, err, "read the business of")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"business": st})
}

// POST /internal/v1/merchant-applications/{id}/request-information
// {message, reviewed_by} — the review waits for the applicant.
func (h *MerchantApplicationAdminHandler) RequestInformation(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	var body struct {
		Message    string `json:"message"`
		ReviewedBy string `json:"reviewed_by"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	app, err := h.svc.RequestInformation(r.Context(), chi.URLParam(r, "id"), body.ReviewedBy, body.Message)
	if err != nil {
		respondLifecycleError(w, r, err, "request information for")
		return
	}
	slog.InfoContext(r.Context(), "merchant.application.information_requested", "application_id", app.ID)
	observeApplication(appActionRequestInformation, appResultOK)
	writeJSON(w, http.StatusOK, app)
}

// ── public: the applicant, by application reference ─────────────────────────

// GET /v1/merchant/application-requirements — the policy every surface
// renders: which fields and documents a Business application needs.
func (h *MerchantApplicationAdminHandler) RequirementsPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"policy_version": service.RequirementPolicyVersion,
		"items":          service.BusinessApplicationPolicy,
	})
}

// GET /v1/merchant/applications/{id} — where the application stands and what
// it still needs. The reference is the capability; the answer carries no
// personal data.
func (h *MerchantApplicationAdminHandler) PublicStatus(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	st, err := h.svc.PublicStatus(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, service.ErrApplicationNotFound) {
		apierror.Respond(w, r, http.StatusNotFound, "APPLICATION_NOT_FOUND", "application not found")
		return
	}
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not read the application")
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// POST /v1/merchant/applications/{id}/resubmit — the applicant answered the
// reviewer; back to review.
func (h *MerchantApplicationAdminHandler) Resubmit(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	st, err := h.svc.Resubmit(r.Context(), chi.URLParam(r, "id"))
	switch {
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "APPLICATION_NOT_FOUND", "application not found")
	case errors.Is(err, service.ErrNothingToResubmit):
		apierror.Respond(w, r, http.StatusConflict, "NOT_WAITING_FOR_INFORMATION", err.Error())
	case errors.Is(err, service.ErrRequiredDocumentsMissing):
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "REQUIREMENTS_NOT_MET", err.Error())
	case err != nil:
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not resubmit the application")
	default:
		observeApplication(appActionResubmit, appResultOK)
		writeJSON(w, http.StatusOK, st)
	}
}
