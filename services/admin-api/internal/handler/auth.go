package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// LoginStore is the slice of AdminUserService the auth handler needs (interface
// for testability; *service.AdminUserService satisfies it).
type LoginStore interface {
	GetByEmail(ctx context.Context, email string) (service.AdminUser, error)
	GetByID(ctx context.Context, id string) (service.AdminUser, error)
	UpdatePassword(ctx context.Context, id, passwordHash string) error
	RecordFailedLogin(ctx context.Context, id string) (*time.Time, error)
	ResetLoginCountersAndTouch(ctx context.Context, id string)
	RecordLoginAttempt(ctx context.Context, emailNorm string, adminUserID *string, ip, userAgent string, success bool, failureReason string)
}

// clientIP extracts the caller IP (nginx sets X-Real-IP to cf-connecting-ip).
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if i := strings.IndexByte(v, ','); i > 0 {
			return strings.TrimSpace(v[:i])
		}
		return v
	}
	return r.RemoteAddr
}

// AuthHandler implements operator login / me / logout. Errors are deliberately
// generic (never reveal whether an email exists). Passwords and tokens are
// never logged.
type AuthHandler struct {
	users     LoginStore
	jwtSecret string
	ttl       time.Duration
}

func NewAuthHandler(users LoginStore, jwtSecret string, ttl time.Duration) *AuthHandler {
	return &AuthHandler{users: users, jwtSecret: jwtSecret, ttl: ttl}
}

type userDTO struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

func (h *AuthHandler) ready(w http.ResponseWriter) bool {
	if h.users == nil || h.jwtSecret == "" {
		writeErr(w, http.StatusServiceUnavailable, "operator authentication is not configured")
		return false
	}
	return true
}

// POST /admin/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
		return
	}

	ctx := r.Context()
	emailNorm := strings.ToLower(strings.TrimSpace(body.Email))
	ip, ua := clientIP(r), r.UserAgent()
	now := time.Now()

	u, err := h.users.GetByEmail(ctx, emailNorm)
	if err != nil {
		// Unknown email: record the attempt (no lock for non-existent users),
		// respond generically — never reveal whether the email exists.
		h.users.RecordLoginAttempt(ctx, emailNorm, nil, ip, ua, false, "UNKNOWN_EMAIL")
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
		return
	}
	if u.IsLocked(now) {
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, "LOCKED")
		writeError(w, http.StatusTooManyRequests, "TOO_MANY_ATTEMPTS", "too many attempts, try again later")
		return
	}
	if u.Status == "SUSPENDED" {
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, "SUSPENDED")
		writeError(w, http.StatusForbidden, "ACCOUNT_SUSPENDED", "account suspended")
		return
	}
	// INVITED (or any non-ACTIVE) account has no usable password yet. Empty hash
	// = operator must set a password via the invite/reset link. Both are a
	// generic failed login — never reveal the account state.
	if u.PasswordHash == "" || !auth.VerifyPassword(u.PasswordHash, body.Password) {
		reason := "BAD_PASSWORD"
		if u.PasswordHash == "" {
			reason = "NO_PASSWORD_SET"
		}
		_, _ = h.users.RecordFailedLogin(ctx, u.ID)
		h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, false, reason)
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
		return
	}

	principal := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role}
	token, exp, err := auth.Issue(h.jwtSecret, principal, h.ttl, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not issue session")
		return
	}
	h.users.ResetLoginCountersAndTouch(ctx, u.ID)
	h.users.RecordLoginAttempt(ctx, emailNorm, &u.ID, ip, ua, true, "")
	slog.InfoContext(ctx, "admin.login", "admin_user_id", u.ID, "role", u.Role) // no password/token

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": exp,
		"user":       userDTO{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role},
	})
}

// GET /admin/v1/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": userDTO{ID: p.ID, Email: p.Email, FullName: p.FullName, Role: p.Role},
	})
}

// POST /admin/v1/auth/logout — stateless JWT, so this is a client-side clear;
// the endpoint exists for symmetry and future server-side revocation.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

// POST /admin/v1/auth/change-password — operator changes their own password.
// Auth comes from the JWT middleware (principal in context); the body never
// reaches the logs and no hash/password is ever returned. A wrong current
// password is a 400 (not 401) so it does NOT trigger the client's auto-logout.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthenticated")
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid request body")
		return
	}

	u, err := h.users.GetByID(r.Context(), p.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not change password")
		return
	}
	// Wrong current password → 400 (human, no technical detail). Not 401, to
	// avoid the client treating it as an expired session.
	if !auth.VerifyPassword(u.PasswordHash, body.CurrentPassword) {
		writeError(w, http.StatusBadRequest, "INVALID_CURRENT_PASSWORD", "current password is incorrect")
		return
	}
	if len(body.NewPassword) < 10 {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 10 characters")
		return
	}
	if auth.VerifyPassword(u.PasswordHash, body.NewPassword) {
		writeError(w, http.StatusConflict, "SAME_PASSWORD", "new password must differ from the current one")
		return
	}

	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 10 characters")
		return
	}
	if err := h.users.UpdatePassword(r.Context(), u.ID, hash); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not change password")
		return
	}
	slog.InfoContext(r.Context(), "admin.password_changed", "admin_user_id", u.ID) // no password/hash
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// writeJSON is shared with other handlers (helpers.go); declared there.
