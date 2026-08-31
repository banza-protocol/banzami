package accountidentity

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

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
	get("/auth/me", h.Me)
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
		h.svc.Logout(r.Context(), raw, realIP(r), obs.RequestID(r.Context()))
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

func userView(u User) map[string]any {
	return map[string]any{
		"id":       u.ID,
		"email":    u.Email,
		"name":     u.Name,
		"verified": u.Verified,
		"status":   u.Status,
	}
}

// realIP prefers X-Forwarded-For left-most (set by the trusted proxy), else
// RemoteAddr host.
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := indexComma(xff); i >= 0 {
			return trimSpace(xff[:i])
		}
		return trimSpace(xff)
	}
	host := r.RemoteAddr
	if i := lastColon(host); i >= 0 {
		return host[:i]
	}
	return host
}

func indexComma(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			return i
		}
	}
	return -1
}
func lastColon(s string) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == ':' {
			return i
		}
	}
	return -1
}
func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
