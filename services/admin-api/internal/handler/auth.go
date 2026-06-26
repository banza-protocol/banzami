package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// LoginStore is the slice of AdminUserService the login flow needs (interface
// for testability; *service.AdminUserService satisfies it).
type LoginStore interface {
	GetByEmail(ctx context.Context, email string) (service.AdminUser, error)
	TouchLastLogin(ctx context.Context, id string)
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
		// Generic — never reveal which field / whether the email exists.
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	u, err := h.users.GetByEmail(r.Context(), body.Email)
	if err != nil {
		// Run a dummy verify is unnecessary here; respond generically.
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if u.Status != "ACTIVE" {
		writeErr(w, http.StatusForbidden, "account suspended")
		return
	}
	if !auth.VerifyPassword(u.PasswordHash, body.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	principal := auth.Principal{ID: u.ID, Email: u.Email, FullName: u.FullName, Role: u.Role}
	token, exp, err := auth.Issue(h.jwtSecret, principal, h.ttl, time.Now())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not issue session")
		return
	}
	h.users.TouchLastLogin(r.Context(), u.ID)
	slog.InfoContext(r.Context(), "admin.login", "admin_user_id", u.ID, "role", u.Role) // no password/token

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

// writeJSON is shared with other handlers (helpers.go); declared there.
