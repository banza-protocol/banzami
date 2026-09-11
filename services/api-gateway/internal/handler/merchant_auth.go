package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// merchantAccessTTL is the lifetime of a Business App access token.
//
// A sign-in opens a SESSION (migration 0120): the access token lives minutes
// and the app renews it with a rotating refresh token the server can revoke.
// It used to be one 24-hour bearer token with no renewal, so an expired token
// could only be replaced by asking for the PIN — and a device that missed that
// moment looked signed in while every financial call answered 401. A short
// access token also bounds what a stolen one is worth; suspension and handle
// changes take effect at the next renewal.
const merchantAccessTTL = 15 * time.Minute

// MerchantAuthHandler implements @handle + PIN login for the Banzami Business
// app. It issues the SAME merchant JWT as the API-key flow, so all existing
// merchant routes work unchanged. The API-key login is untouched.
type MerchantAuthHandler struct {
	cfg      *config.Config
	creds    service.MerchantCredentialService
	sessions service.MerchantSessionService
}

func NewMerchantAuthHandler(cfg *config.Config, creds service.MerchantCredentialService) *MerchantAuthHandler {
	return &MerchantAuthHandler{cfg: cfg, creds: creds}
}

// WithSessions enables renewable sessions. Without it a sign-in is refused:
// a Business App access token that cannot be renewed is the defect 0120 fixed.
func (h *MerchantAuthHandler) WithSessions(s service.MerchantSessionService) *MerchantAuthHandler {
	h.sessions = s
	return h
}

// issue mints an access token for an open session and writes the sign-in or
// renewal response.
func (h *MerchantAuthHandler) issue(w http.ResponseWriter, r *http.Request, sess service.IssuedSession, status int) {
	token, expiresAt, err := middleware.NewMerchantToken(
		h.cfg.JWTSecret, sess.MerchantID, []string{"*"}, sess.Environment, merchantAccessTTL,
	)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}
	writeJSON(w, status, map[string]any{
		"token":              token,
		"expires_at":         expiresAt,
		"token_type":         "Bearer",
		"environment":        sess.Environment,
		"refresh_token":      sess.RefreshToken,
		"refresh_expires_at": sess.RefreshExpiresAt.UTC().Format(time.RFC3339),
	})
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
	switch {
	case err == nil:
	case errors.Is(err, service.ErrMerchantLocked):
		businessAuthAttempts.WithLabelValues(authResultLocked).Inc()
		slog.WarnContext(r.Context(), "merchant.auth.locked", "ip", r.RemoteAddr)
		apierror.Respond(w, r, http.StatusTooManyRequests, "LOCKED", "too many attempts; try again later")
		return
	case errors.Is(err, service.ErrMerchantCredsInvalid):
		// Unknown handle, wrong PIN, not activated, suspended, or a credential
		// that is not the handle's owner's: the same 401 (non-enumerating).
		if errors.Is(err, service.ErrHandleOwnerMismatch) {
			businessAuthAttempts.WithLabelValues(authResultOwnerMismatch).Inc()
		} else {
			businessAuthAttempts.WithLabelValues(authResultRefused).Inc()
		}
		slog.WarnContext(r.Context(), "merchant.auth.invalid",
			"ip", r.RemoteAddr, "user_agent", r.Header.Get("User-Agent"))
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid handle or pin")
		return
	default:
		// The credential store could not answer. That is not a refusal: a 401
		// here made the Business App forget the handle and PIN on a database
		// blip (A8-09). 503, and the app keeps its session and says so.
		businessAuthAttempts.WithLabelValues(authResultUnavailable).Inc()
		slog.ErrorContext(r.Context(), "merchant.auth.verify_failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "sign-in is temporarily unavailable; try again")
		return
	}

	if h.sessions == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "handle login is not available")
		return
	}
	sess, err := h.sessions.Open(r.Context(), merchantID, env)
	if err != nil {
		slog.ErrorContext(r.Context(), "merchant.auth.session_open_failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to open session")
		return
	}
	businessAuthAttempts.WithLabelValues(authResultIssued).Inc()
	slog.InfoContext(r.Context(), "merchant.auth.token.issued", "merchant_id", merchantID, "environment", env)
	h.issue(w, r, sess, http.StatusOK)
}

// POST /v1/merchant/auth/refresh   {refresh_token}
// Renews a Business App session: a new access token and a new refresh token;
// the presented one is spent. Any refusal — unknown, expired, revoked,
// reused, Business suspended, handle gone — is the same 401, and the app
// returns to sign-in.
func (h *MerchantAuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	if h.sessions == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "UNAVAILABLE", "handle login is not available")
		return
	}
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		apierror.Respond(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "refresh_token is required")
		return
	}
	sess, err := h.sessions.Renew(r.Context(), body.RefreshToken)
	switch {
	case errors.Is(err, service.ErrSessionReused):
		businessAuthAttempts.WithLabelValues(authResultRefreshReused).Inc()
		slog.WarnContext(r.Context(), "merchant.auth.refresh_reused")
		apierror.Respond(w, r, http.StatusUnauthorized, "SESSION_ENDED", "the session has ended; sign in again")
		return
	case errors.Is(err, service.ErrSessionInvalid):
		businessAuthAttempts.WithLabelValues(authResultRefreshRefused).Inc()
		apierror.Respond(w, r, http.StatusUnauthorized, "SESSION_ENDED", "the session has ended; sign in again")
		return
	case err != nil:
		slog.ErrorContext(r.Context(), "merchant.auth.refresh_failed", "error_kind", fmt.Sprintf("%T", err))
		apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not renew the session; try again")
		return
	}
	businessAuthAttempts.WithLabelValues(authResultRefreshed).Inc()
	h.issue(w, r, sess, http.StatusOK)
}

// POST /v1/merchant/auth/logout   {refresh_token}
// Ends the sign-in the token belongs to. Always 204: signing out of a session
// that already ended is still signed out, and the answer reveals nothing.
func (h *MerchantAuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if h.sessions != nil {
		if err := h.sessions.End(r.Context(), body.RefreshToken); err != nil {
			slog.ErrorContext(r.Context(), "merchant.auth.logout_failed", "error_kind", fmt.Sprintf("%T", err))
			apierror.Respond(w, r, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "could not end the session; try again")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
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

// POST /v1/merchant/auth/claim — retired.
//
// It set a Business App PIN for whoever held a merchant token — an API-key
// token included — and on an activated Business it replaced the PIN and
// cleared the lockout. Nothing called it, and a PIN it set on a Business that
// had not activated could never sign in (sign-in requires activation). A
// Business's PIN is set in one place: its activation link (ADR-058/059). The
// route answers 410 so an old client learns why, not a 404.
func (h *MerchantAuthHandler) Claim(w http.ResponseWriter, r *http.Request) {
	apierror.Respond(w, r, http.StatusGone, "PIN_SET_BY_ACTIVATION",
		"a Business's app PIN is set only through its activation link")
}
