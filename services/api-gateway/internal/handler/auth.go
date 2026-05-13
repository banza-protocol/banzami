package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

const tokenTTL = 24 * time.Hour

type AuthHandler struct {
	cfg         *config.Config
	merchantSvc service.MerchantService
}

func NewAuthHandler(cfg *config.Config, merchantSvc service.MerchantService) *AuthHandler {
	return &AuthHandler{cfg: cfg, merchantSvc: merchantSvc}
}

// POST /v1/auth/token
// Exchanges a raw API key for a signed JWT. No authentication is required on
// this endpoint — the API key itself is the credential being verified.
func (h *AuthHandler) Token(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ApiKey string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ApiKey == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "api_key is required")
		return
	}

	merchant, err := h.merchantSvc.VerifyApiKey(r.Context(), body.ApiKey)
	if err != nil {
		if errors.Is(err, service.ErrKeyRevoked) {
			apierror.Respond(w, r, http.StatusUnauthorized, "KEY_REVOKED", "API key has been revoked")
			return
		}
		// ErrInvalidApiKey and anything else → same 401 (no key enumeration)
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid API key")
		return
	}

	token, expiresAt, err := middleware.NewMerchantToken(
		h.cfg.JWTSecret,
		merchant.ID,
		[]string{"*"},
		tokenTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": expiresAt,
		"token_type": "Bearer",
	})
}
