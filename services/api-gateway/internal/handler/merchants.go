package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/banza-protocol/banzami/services/api-gateway/internal/apierror"
	"github.com/banza-protocol/banzami/services/api-gateway/internal/service"
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

// GET /v1/merchants/{id}
func (h *MerchantHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

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
	id := chi.URLParam(r, "id")

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
	merchantID := chi.URLParam(r, "id")

	var body struct {
		Name        string `json:"name"`
		Environment string `json:"environment"` // "LIVE" | "SANDBOX"; defaults to "LIVE"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_REQUEST", "request body is not valid JSON")
		return
	}
	if body.Name == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}

	env := service.ApiKeyEnvironmentLive
	switch body.Environment {
	case "", "LIVE":
		env = service.ApiKeyEnvironmentLive
	case "SANDBOX":
		env = service.ApiKeyEnvironmentSandbox
	default:
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			`environment must be "LIVE" or "SANDBOX"`)
		return
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
	merchantID := chi.URLParam(r, "id")

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
	merchantID := chi.URLParam(r, "id")
	keyID      := chi.URLParam(r, "keyID")

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
