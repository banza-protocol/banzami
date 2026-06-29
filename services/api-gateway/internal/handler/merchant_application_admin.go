package handler

import (
	"encoding/json"
	"errors"
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
	svc  service.MerchantApplicationAdminService
	gate *service.EnvGate
}

func NewMerchantApplicationAdminHandler(svc service.MerchantApplicationAdminService, gate *service.EnvGate) *MerchantApplicationAdminHandler {
	return &MerchantApplicationAdminHandler{svc: svc, gate: gate}
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
	switch {
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "application not found")
	case errors.Is(err, service.ErrApplicationNotOpen):
		apierror.Respond(w, r, http.StatusConflict, "NOT_OPEN", "application is not open for review")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not approve application")
	default:
		// merchant_id is safe to log; the activation token is NOT.
		slog.InfoContext(r.Context(), "merchant.application.approved",
			"application_id", res.ApplicationID, "merchant_id", res.MerchantID)
		writeJSON(w, http.StatusOK, res)
	}
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
	switch {
	case errors.Is(err, service.ErrApplicationNotFound):
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "application not found")
	case errors.Is(err, service.ErrApplicationNotOpen):
		apierror.Respond(w, r, http.StatusConflict, "NOT_OPEN", "application is not open for review")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not reject application")
	default:
		slog.InfoContext(r.Context(), "merchant.application.rejected", "application_id", res.ApplicationID)
		writeJSON(w, http.StatusOK, res)
	}
}
