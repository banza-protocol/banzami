package accountidentity

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/common/clientip"
	"github.com/banzami/banzami/services/common/obs"
	"github.com/banzami/banzami/services/developer-api/internal/httpx"
)

// Handlers exposes the Account Identity HTTP surface:
//
//	POST /auth/request-otp · POST /auth/verify · POST /auth/logout · GET /auth/me
type Handlers struct {
	svc           *Service
	consoleOrigin string
	secure        bool // Secure cookies + __Host- prefix (https only)
}

// NewHandlers builds the auth handlers. secure=true issues a __Host- host-only
// cookie (required over https); false uses a plain name for local http dev.
func NewHandlers(svc *Service, consoleOrigin string, secure bool) *Handlers {
	return &Handlers{svc: svc, consoleOrigin: consoleOrigin, secure: secure}
}

func (h *Handlers) cookieName() string {
	if h.secure {
		return "__Host-bz_dev_session"
	}
	return "bz_dev_session"
}

func (h *Handlers) setSessionCookie(w http.ResponseWriter, raw string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookieName(),
		Value:    raw,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(ttl.Seconds()),
		// No Domain attribute — host-only.
	})
}

func (h *Handlers) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: h.cookieName(), Value: "", Path: "/", HttpOnly: true,
		Secure: h.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func (h *Handlers) rawSession(r *http.Request) string {
	c, err := r.Cookie(h.cookieName())
	if err != nil {
		return ""
	}
	return c.Value
}

// originOK enforces the exact console Origin on state-changing requests.
func (h *Handlers) originOK(r *http.Request) bool {
	return r.Header.Get("Origin") == h.consoleOrigin
}

// Register mounts the auth endpoints on a router-agnostic mux via a func.
func (h *Handlers) Register(get, post func(pattern string, hf http.HandlerFunc)) {
	post("/auth/request-otp", h.RequestOTP)
	post("/auth/verify", h.Verify)
	post("/auth/logout", h.Logout)
	post("/auth/me", h.UpdateMe)
	get("/auth/me", h.Me)
	get("/auth/sessions", h.Sessions)
	post("/auth/sessions/revoke-others", h.RevokeOtherSessions)
}

// GET /auth/sessions — the person's own live sessions. Never a token or a hash.
func (h *Handlers) Sessions(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.Sessions(r.Context(), h.rawSession(r))
	if errors.Is(err, ErrUnauthenticated) {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
		return
	}
	if err != nil {
		// A read that failed is not a statement about who the caller is. This
		// mapped every error to 401, so a broken query read as "not signed in" —
		// and that is exactly how the host(ip) fault below reached production.
		httpx.Error(w, http.StatusServiceUnavailable, "SESSIONS_UNAVAILABLE", "could not read your sessions just now")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": list})
}

// POST /auth/sessions/revoke-others — sign out everywhere but here.
// Session-authenticated + Origin + CSRF, like every other mutation.
func (h *Handlers) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	if !h.originOK(r) {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
		return
	}
	raw := h.rawSession(r)
	if !h.svc.ValidateCSRF(raw, r.Header.Get("X-CSRF-Token")) {
		httpx.Error(w, http.StatusForbidden, "CSRF", "missing or invalid CSRF token")
		return
	}
	n, err := h.svc.RevokeOtherSessions(r.Context(), raw)
	if errors.Is(err, ErrUnauthenticated) {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "SESSIONS_UNAVAILABLE", "could not end the other sessions just now")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"revoked": n})
}

func decode(r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 4096))
	dec.DisallowUnknownFields()
	return dec.Decode(v) == nil
}

// POST /auth/request-otp {email}
func (h *Handlers) RequestOTP(w http.ResponseWriter, r *http.Request) {
	if !h.originOK(r) {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if !decode(r, &body) {
		httpx.Error(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}
	ip, reqID := realIP(r), obs.RequestID(r.Context())
	switch err := h.svc.RequestOTP(r.Context(), body.Email, ip, reqID); err {
	case nil:
		// Uniform response — never reveals whether an account exists.
		httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
	case ErrInvalidEmail:
		httpx.Error(w, http.StatusBadRequest, "INVALID_EMAIL", "invalid email")
	case ErrRateLimited, ErrCooldown:
		httpx.Error(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many requests, try again later")
	default:
		// The public response is unchanged — a uniform UNAVAILABLE that reveals
		// nothing about accounts, providers or infrastructure. What changes is
		// that the operator can now tell WHY.
		//
		// This endpoint returned 503 with no log line at all, from the public
		// Internet, across two assurance stages. A failure that leaves no trace is
		// indistinguishable from a capability that is switched off, and it cost
		// both stages their credential path. The error's type and message are
		// logged; the email is included because this endpoint already receives it
		// and it is the only way to correlate a report with a request. The OTP
		// itself, the pepper and the session secret never pass through here.
		slog.ErrorContext(r.Context(), "auth.request_otp.failed",
			"stage", "request_otp",
			"error_kind", fmt.Sprintf("%T", err),
			"error", err.Error(),
			"email", body.Email,
			"request_id", reqID)
		httpx.Error(w, http.StatusServiceUnavailable, "UNAVAILABLE", "service unavailable")
	}
}

// POST /auth/verify {email, code}
func (h *Handlers) Verify(w http.ResponseWriter, r *http.Request) {
	if !h.originOK(r) {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
		return
	}
	var body struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if !decode(r, &body) {
		httpx.Error(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}
	ip, reqID := realIP(r), obs.RequestID(r.Context())
	res, err := h.svc.VerifyOTP(r.Context(), body.Email, body.Code, ip, r.UserAgent(), reqID)
	switch err {
	case nil:
		h.setSessionCookie(w, res.SessionRaw, res.SessionTTL)
		httpx.JSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"csrf_token": res.CSRFToken,
			"user":       userView(res.User),
		})
	case ErrInvalidCode:
		httpx.Error(w, http.StatusUnauthorized, "INVALID_CODE", "invalid or expired code")
	case ErrRateLimited:
		httpx.Error(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many attempts, try again later")
	default:
		httpx.Error(w, http.StatusServiceUnavailable, "UNAVAILABLE", "service unavailable")
	}
}

// POST /auth/logout — session-authenticated + Origin + CSRF.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if !h.originOK(r) {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
		return
	}
	raw := h.rawSession(r)
	if raw != "" {
		if !h.svc.ValidateCSRF(raw, r.Header.Get("X-CSRF-Token")) {
			httpx.Error(w, http.StatusForbidden, "CSRF", "missing or invalid CSRF token")
			return
		}
		if err := h.svc.Logout(r.Context(), raw, realIP(r), obs.RequestID(r.Context())); err != nil {
			// The session is still live server-side. The cookie is kept, so the
			// person can sign out again; clearing it would leave a working token
			// behind a Console that says "signed out" (A2-24).
			slog.ErrorContext(r.Context(), "auth.logout.revoke_failed", "request_id", obs.RequestID(r.Context()))
			httpx.Error(w, http.StatusServiceUnavailable, "UNAVAILABLE", "could not sign out; try again")
			return
		}
	}
	h.clearSessionCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /auth/me — safe method; returns the current user + a CSRF token.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	raw := h.rawSession(r)
	user, err := h.svc.ValidateSession(r.Context(), raw)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":       userView(user),
		"csrf_token": h.svc.csrfFor(raw),
	})
}

// POST /auth/me {name} — session-authenticated + Origin + CSRF.
//
// POST rather than PATCH because Register only wires GET and POST, and this is
// the same authority as every other mutation on this surface; the semantics are
// a partial update of the caller's own record and nobody else's — the id comes
// from the session, so there is no field to forge.
func (h *Handlers) UpdateMe(w http.ResponseWriter, r *http.Request) {
	if !h.originOK(r) {
		httpx.Error(w, http.StatusForbidden, "FORBIDDEN_ORIGIN", "origin not allowed")
		return
	}
	raw := h.rawSession(r)
	user, err := h.svc.ValidateSession(r.Context(), raw)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
		return
	}
	if !h.svc.ValidateCSRF(raw, r.Header.Get("X-CSRF-Token")) {
		httpx.Error(w, http.StatusForbidden, "CSRF", "missing or invalid CSRF token")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if !decode(r, &body) {
		httpx.Error(w, http.StatusBadRequest, "INVALID_BODY", "name is required")
		return
	}
	updated, err := h.svc.SetName(r.Context(), user.ID, body.Name, realIP(r), obs.RequestID(r.Context()))
	switch {
	case errors.Is(err, ErrInvalidName):
		httpx.Error(w, http.StatusBadRequest, "INVALID_NAME", "name must not be empty and must be at most 80 characters")
		return
	case err != nil:
		httpx.Error(w, http.StatusServiceUnavailable, "UNAVAILABLE", "service unavailable")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user":       userView(updated),
		"csrf_token": h.svc.csrfFor(raw),
	})
}

func userView(u User) map[string]any {
	return map[string]any{
		"id":       u.ID,
		"email":    u.Email,
		"name":     u.Name,
		"verified": u.Verified,
		"status":   u.Status,
	}
}

// realIP is the client clientip resolved for this service (RemoteAddr): the
// edge's X-Real-IP only when the peer is a trusted proxy. It read the leftmost
// X-Forwarded-For itself — a value the caller writes — so rotating it bought a
// fresh OTP allowance per request (A9-09).
func realIP(r *http.Request) string { return clientip.Host(r.RemoteAddr) }
