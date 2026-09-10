package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Business onboarding from a Developer Project, and a Business's consent to be
// used by one.
//
// The Developers Console reaches the same Business application domain the
// public form does — same fields, same documents, same review — through
// developer-api, which authorises the developer against the Project and calls
// these internal routes. Nothing here is reachable from a browser: an
// application carrying a Project, and a link code's redemption, both need the
// internal credential.
//
// The Business App side is a signed-in Business issuing a code for its own
// consent (POST /v1/merchant/project-link-codes).
type BusinessOnboardingHandler struct {
	apps  service.MerchantApplicationService
	admin service.MerchantApplicationAdminService
	links service.BusinessLinkCodeService
	gate  *service.EnvGate
}

func NewBusinessOnboardingHandler(apps service.MerchantApplicationService, admin service.MerchantApplicationAdminService,
	links service.BusinessLinkCodeService, gate *service.EnvGate) *BusinessOnboardingHandler {
	return &BusinessOnboardingHandler{apps: apps, admin: admin, links: links, gate: gate}
}

// POST /internal/v1/merchant-applications/for-project
// The application a Project's Financial Setup submits. Same validation as the
// public form, plus the Project and the Console user who submitted it.
func (h *BusinessOnboardingHandler) SubmitForProject(w http.ResponseWriter, r *http.Request) {
	if h.apps == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "onboarding is not available")
		return
	}
	var body struct {
		ProjectID           string `json:"project_id"`
		SubmittedByUserID   string `json:"submitted_by_user_id"`
		DesiredHandle       string `json:"desired_handle"`
		BusinessName        string `json:"business_name"`
		Category            string `json:"category"`
		Subcategory         string `json:"subcategory"`
		Email               string `json:"email"`
		Phone               string `json:"phone"`
		Nif                 string `json:"nif"`
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
		IdempotencyKey      string `json:"idempotency_key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	env := h.gate.StackEnv()
	if env == "" {
		env = "SANDBOX"
	}
	id, err := h.apps.Submit(r.Context(), service.MerchantApplicationInput{
		Environment: env, DesiredHandle: body.DesiredHandle, BusinessName: body.BusinessName,
		Category: body.Category, Subcategory: body.Subcategory, Email: body.Email, Phone: body.Phone,
		Nif: body.Nif, Country: "Angola", Province: body.Province, Municipality: body.Municipality,
		City: body.City, Address: body.Address, AddressReference: body.AddressReference,
		LegalRepresentative: body.LegalRepresentative, RepresentativeRole: body.RepresentativeRole,
		RepresentativeEmail: body.RepresentativeEmail, RepresentativePhone: body.RepresentativePhone,
		BusinessActivity: body.BusinessActivity, EstimatedVolume: body.EstimatedVolume,
		TermsAccepted: body.TermsAccepted, IdempotencyKey: body.IdempotencyKey,
		Origin: service.ApplicationOriginDeveloperProject, ProjectID: body.ProjectID,
		SubmittedByUserID: body.SubmittedByUserID,
	})
	switch {
	case errors.Is(err, service.ErrHandleInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
	case errors.Is(err, service.ErrApplicationIncomplete):
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "business name, email and terms acceptance are required")
	case errors.Is(err, service.ErrApplicationOrigin):
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
	case errors.Is(err, service.ErrProjectHasOpenApplication):
		apierror.Respond(w, r, http.StatusConflict, "APPLICATION_IN_PROGRESS", err.Error())
	case errors.Is(err, service.ErrHandleReserved):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_RESERVED", "this handle is reserved")
	case errors.Is(err, service.ErrHandleOwnedByBusiness):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_OWNED_BY_BUSINESS",
			"a Business Account already uses this handle; connect it with the Business's consent instead")
	case errors.Is(err, service.ErrMerchantHandleTaken):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "this handle is no longer available")
	case err != nil:
		slog.ErrorContext(r.Context(), "merchant.application.project_submit_failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not submit application")
	default:
		observeApplication(appActionSubmit, appResultOK)
		slog.InfoContext(r.Context(), "merchant.application.submitted", "application_id", id, "origin", service.ApplicationOriginDeveloperProject)
		writeJSON(w, http.StatusCreated, map[string]any{"application_id": id, "status": "SUBMITTED"})
	}
}

// GET /internal/v1/merchant-applications/for-project/{projectID}
func (h *BusinessOnboardingHandler) LatestForProject(w http.ResponseWriter, r *http.Request) {
	if h.admin == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "applications are not available")
		return
	}
	app, err := h.admin.LatestForProject(r.Context(), chi.URLParam(r, "projectID"))
	if errors.Is(err, service.ErrApplicationNotFound) {
		apierror.Respond(w, r, http.StatusNotFound, "APPLICATION_NOT_FOUND", "this Project has not applied")
		return
	}
	if err != nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not read the application")
		return
	}
	writeJSON(w, http.StatusOK, app)
}

// POST /v1/merchant/project-link-codes — the signed-in Business consents to a
// Developer Project connecting to it. The code is shown once, on this screen.
func (h *BusinessOnboardingHandler) IssueLinkCode(w http.ResponseWriter, r *http.Request) {
	if h.links == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "connecting a Project is not available")
		return
	}
	p, ok := middleware.GetPrincipal(r.Context())
	if !ok || p.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}
	code, err := h.links.Issue(r.Context(), p.MerchantID, p.Environment)
	if err != nil {
		slog.ErrorContext(r.Context(), "business.link_code.issue_failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not create a code; try again")
		return
	}
	businessLinkCodes.WithLabelValues(linkResultIssued).Inc()
	slog.InfoContext(r.Context(), "business.link_code.issued", "merchant_id", p.MerchantID)
	writeJSON(w, http.StatusCreated, code)
}

// POST /internal/v1/business-link-codes/redeem {code, project_id}
// developer-api spends a code for a Project it has authorised the developer
// on, and binds the Project to the Business it names.
func (h *BusinessOnboardingHandler) RedeemLinkCode(w http.ResponseWriter, r *http.Request) {
	if h.links == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "connecting a Project is not available")
		return
	}
	var body struct {
		Code      string `json:"code"`
		ProjectID string `json:"project_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}
	target, err := h.links.Redeem(r.Context(), body.Code, body.ProjectID)
	switch {
	case errors.Is(err, service.ErrLinkCodeInvalid):
		businessLinkCodes.WithLabelValues(linkResultRefused).Inc()
		apierror.Respond(w, r, http.StatusUnprocessableEntity, "LINK_CODE_INVALID", err.Error())
	case errors.Is(err, service.ErrLinkBusinessNotReady):
		businessLinkCodes.WithLabelValues(linkResultNotReady).Inc()
		apierror.Respond(w, r, http.StatusConflict, "BUSINESS_NOT_READY", err.Error())
	case err != nil:
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not check the code; try again")
	default:
		businessLinkCodes.WithLabelValues(linkResultRedeemed).Inc()
		writeJSON(w, http.StatusOK, target)
	}
}
