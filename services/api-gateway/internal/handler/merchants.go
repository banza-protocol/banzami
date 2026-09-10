package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	banzamienv "github.com/banzami/banzami/services/common/env"
)

type MerchantHandler struct {
	svc service.MerchantService
}

func NewMerchantHandler(svc service.MerchantService) *MerchantHandler {
	return &MerchantHandler{svc: svc}
}

// POST /v1/merchants
func (h *MerchantHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req service.CreateMerchantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_REQUEST", "request body is not valid JSON")
		return
	}
	if req.Name == "" || req.Email == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "name and email are required")
		return
	}

	m, err := h.svc.Create(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrDuplicateEmail) {
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE_EMAIL", "a merchant with this email already exists")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create merchant")
		return
	}

	writeJSON(w, http.StatusCreated, m)
}

// requireSelfMerchant enforces that the {id} path segment names the SAME
// Business Account as the authenticated principal (SEC-003).
//
// /v1/merchants/{id}/... is the merchant SELF-SERVICE surface, not an operator
// surface: operator actions on arbitrary merchants belong to admin-api
// (/admin/v1/merchants/...) and to the gateway's InternalAuth-guarded
// /internal/v1 group. Without this check, any authenticated merchant could name
// another merchant's id in the URL and — most severely — mint a LIVE API key for
// that merchant (POST /{id}/api-keys returns the plaintext key), taking over the
// victim's Business Account and its payment authority.
//
// A mismatch is reported as NOT_FOUND so the surface cannot be used to confirm
// which merchant ids exist. Returns (merchantID, true) only when the caller may
// proceed; when it returns false the response has already been written.
func requireSelfMerchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "merchant authentication required")
		return "", false
	}
	if id := chi.URLParam(r, "id"); id != principal.MerchantID {
		slog.WarnContext(r.Context(), "merchant.cross_account_attempt",
			"path", r.URL.Path, "caller_merchant_id", principal.MerchantID)
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "merchant not found")
		return "", false
	}
	return principal.MerchantID, true
}

// GET /v1/merchants/{id}
func (h *MerchantHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := requireSelfMerchant(w, r)
	if !ok {
		return
	}

	m, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrMerchantNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "merchant not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to retrieve merchant")
		return
	}

	writeJSON(w, http.StatusOK, m)
}

// POST /v1/merchants/{id}/suspend
func (h *MerchantHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	id, ok := requireSelfMerchant(w, r)
	if !ok {
		return
	}

	m, err := h.svc.Suspend(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrMerchantNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "merchant not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to suspend merchant")
		return
	}

	writeJSON(w, http.StatusOK, m)
}

// POST /v1/merchants/{id}/api-keys
//
// Request body:
//
//	{"name": "My integration key", "environment": "LIVE"}
//
// environment defaults to "LIVE". Use "SANDBOX" to create a test key
// (bz_test_ prefix) that only works against the sandbox data universe.
func (h *MerchantHandler) CreateApiKey(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := requireSelfMerchant(w, r)
	if !ok {
		return
	}

	var body struct {
		Name        string `json:"name"`
		Environment string `json:"environment"` // optional; must equal the session's
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_REQUEST", "request body is not valid JSON")
		return
	}
	if body.Name == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}

	// A key opens the environment of the session that asks for it. An omitted
	// field used to mean LIVE, so a Sandbox Business minted a real-money key by
	// leaving it out; one that names the other environment is refused.
	principal, _ := middleware.GetPrincipal(r.Context())
	sessionEnv := banzamienv.Parse(principal.Environment)
	if !sessionEnv.IsKnown() {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "the session does not name an environment")
		return
	}
	if body.Environment != "" && banzamienv.Parse(body.Environment) != sessionEnv {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"environment must be the session's own ("+sessionEnv.String()+")")
		return
	}
	env := service.ApiKeyEnvironmentLive
	if sessionEnv.IsSandbox() {
		env = service.ApiKeyEnvironmentSandbox
	}

	result, err := h.svc.CreateApiKey(r.Context(), merchantID, body.Name, env)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMerchantNotFound):
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "merchant not found")
		case errors.Is(err, service.ErrMerchantInactive):
			apierror.Respond(w, r, http.StatusUnprocessableEntity, "MERCHANT_INACTIVE", "merchant account is not active")
		default:
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create API key")
		}
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

// GET /v1/merchants/{id}/api-keys
func (h *MerchantHandler) ListApiKeys(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := requireSelfMerchant(w, r)
	if !ok {
		return
	}

	keys, err := h.svc.ListApiKeys(r.Context(), merchantID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list API keys")
		return
	}
	if keys == nil {
		keys = []*service.ApiKeyRecord{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": keys})
}

// DELETE /v1/merchants/{id}/api-keys/{keyID}
func (h *MerchantHandler) RevokeApiKey(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := requireSelfMerchant(w, r)
	if !ok {
		return
	}
	keyID := chi.URLParam(r, "keyID")

	if err := h.svc.RevokeApiKey(r.Context(), merchantID, keyID); err != nil {
		if errors.Is(err, service.ErrApiKeyNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "API key not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to revoke API key")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
