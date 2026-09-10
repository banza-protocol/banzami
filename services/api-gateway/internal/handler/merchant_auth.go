package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// merchantSessionTTL is the lifetime of a @handle + PIN merchant JWT.
//
// It was 30 days, on the reasoning that a handle-login client "cannot
// self-refresh". It can, the same way the consumer app does: unlocking with the
// PIN re-authenticates against this endpoint and replaces the token. A bearer
// token that outlives that by a month is a month in which a stolen one works and
// a suspension only blocks the NEXT login. 24 hours matches the consumer
// session: an unlock refreshes it, and a device left idle past it asks for the
// PIN rather than presenting a dead session. The API-key token TTL (auth.go
// tokenTTL) is unchanged.
const merchantSessionTTL = 24 * time.Hour

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
		h.cfg.JWTSecret, merchantID, []string{"*"}, env, merchantSessionTTL,
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

// POST /v1/merchant/auth/lookup   {handle}
// Non-secret handle lookup so the app only prompts for a PIN when the business
// account exists and can sign in. No auth required. Never returns a PIN/key.
func (h *MerchantAuthHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	if h.creds == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "handle login is not available")
		return
	}

	var body struct {
		Handle string `json:"handle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Handle == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "handle is required")
		return
	}

	// Reject malformed handles up front (the app validates format too). A
	// well-formed handle that simply doesn't exist returns 200 {exists:false}.
	handle := service.NormaliseHandle(body.Handle)
	if service.ValidateHandle(handle) != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_HANDLE", "handle must be 3-30 lowercase letters, digits or underscore")
		return
	}

	res, err := h.creds.LookupHandle(r.Context(), handle)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not look up handle")
		return
	}

	out := map[string]any{"exists": res.Exists, "can_login": res.CanLogin}
	if res.Exists {
		out["status"] = res.Status
		out["display_name"] = res.DisplayName
		out["verified"] = res.Verified
	} else if res.OtherEnvironment != "" {
		// The handle lives in the other environment — let the app say so instead of
		// a misleading "conta não encontrada" (ADR-025).
		out["other_environment"] = res.OtherEnvironment
	}
	writeJSON(w, http.StatusOK, out)
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
