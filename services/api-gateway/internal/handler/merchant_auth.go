package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// MerchantAuthHandler implements @handle + PIN login for the Banzami Business
// app. It issues the SAME merchant JWT as the API-key flow, so all existing
// merchant routes work unchanged. The API-key login is untouched.
type MerchantAuthHandler struct {
	cfg   *config.Config
	creds service.MerchantCredentialService
}

func NewMerchantAuthHandler(cfg *config.Config, creds service.MerchantCredentialService) *MerchantAuthHandler {
	return &MerchantAuthHandler{cfg: cfg, creds: creds}
}

// POST /v1/merchant/auth/token   {handle, pin}
// No JWT required — the handle + PIN are the credential. Returns a merchant JWT
// identical in shape to the API-key token (merchant_id + environment claims).
func (h *MerchantAuthHandler) Token(w http.ResponseWriter, r *http.Request) {
	if h.creds == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "handle login is not available")
		return
	}

	var body struct {
		Handle string `json:"handle"`
		Pin    string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Handle == "" || body.Pin == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "handle and pin are required")
		return
	}

	merchantID, env, err := h.creds.VerifyHandlePin(r.Context(), body.Handle, body.Pin)
	if err != nil {
		if errors.Is(err, service.ErrMerchantLocked) {
			slog.WarnContext(r.Context(), "merchant.auth.locked", "ip", r.RemoteAddr)
			apierror.Respond(w, r, http.StatusTooManyRequests, "LOCKED", "too many attempts; try again later")
			return
		}
		// Unknown handle and wrong PIN return the same 401 (non-enumerating).
		slog.WarnContext(r.Context(), "merchant.auth.invalid",
			"ip", r.RemoteAddr, "user_agent", r.Header.Get("User-Agent"))
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid handle or pin")
		return
	}

	token, expiresAt, err := middleware.NewMerchantToken(
		h.cfg.JWTSecret, merchantID, []string{"*"}, env, tokenTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	slog.InfoContext(r.Context(), "merchant.auth.token.issued",
		"merchant_id", merchantID, "environment", env, "expires_at", expiresAt)

	writeJSON(w, http.StatusOK, map[string]any{
		"token":       token,
		"expires_at":  expiresAt,
		"token_type":  "Bearer",
		"environment": env,
	})
}

// POST /v1/merchant/auth/claim   {handle, pin}
// JWT-protected: an already-authenticated merchant (API-key or handle login)
// claims/updates its @handle + PIN for future app logins.
func (h *MerchantAuthHandler) Claim(w http.ResponseWriter, r *http.Request) {
	if h.creds == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "handle login is not available")
		return
	}

	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return
	}

	var body struct {
		Handle string `json:"handle"`
		Pin    string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "handle and pin are required")
		return
	}

	err := h.creds.Claim(r.Context(), principal.MerchantID, principal.Environment, body.Handle, body.Pin)
	switch {
	case errors.Is(err, service.ErrHandleInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
	case errors.Is(err, service.ErrPinInvalid):
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_PIN", "pin must be 4-8 digits")
	case errors.Is(err, service.ErrHandleReserved):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_RESERVED", "this handle is reserved")
	case errors.Is(err, service.ErrMerchantHandleTaken):
		apierror.Respond(w, r, http.StatusConflict, "HANDLE_TAKEN", "this handle is already taken")
	case err != nil:
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not claim handle")
	default:
		slog.InfoContext(r.Context(), "merchant.auth.handle.claimed",
			"merchant_id", principal.MerchantID, "environment", principal.Environment)
		writeJSON(w, http.StatusOK, map[string]any{"handle": service.NormaliseHandle(body.Handle), "status": "claimed"})
	}
}
