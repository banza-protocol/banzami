package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ResetStore is the slice of AdminUserService the reset flow needs.
type ResetStore interface {
	GetOperator(ctx context.Context, id string) (service.OperatorView, error)
	CreateResetToken(ctx context.Context, adminUserID, createdBy string) (string, time.Time, error)
	ValidateResetToken(ctx context.Context, raw string) (service.ResetTokenInfo, error)
	CompleteReset(ctx context.Context, raw, passwordHash string) (string, error)
}

// ResetMailer sends the set-password email.
type ResetMailer interface {
	AdminPasswordReset(to, fullName, resetURL string)
}

type ResetHandler struct {
	store        ResetStore
	mailer       ResetMailer
	adminBaseURL string
	showLink     bool // dry-run / SMTP off → return reset_url to the SUPER_ADMIN
}

func NewResetHandler(store ResetStore, mailer ResetMailer, adminBaseURL string, showLink bool) *ResetHandler {
	return &ResetHandler{store: store, mailer: mailer, adminBaseURL: adminBaseURL, showLink: showLink}
}

func (h *ResetHandler) ready(w http.ResponseWriter) bool {
	if h.store == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "password reset is not available")
		return false
	}
	return true
}

// POST /admin/v1/operators/{id}/password-reset — authorized via RequireCapability
// (CapOperatorReset) on the route.
func (h *ResetHandler) Request(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	id := chi.URLParam(r, "id")
	op, err := h.store.GetOperator(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrAdminUserNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "operator not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not start reset")
		return
	}

	createdBy := ""
	if p, ok := auth.FromContext(r.Context()); ok {
		createdBy = p.ID
	}
	raw, exp, err := h.store.CreateResetToken(r.Context(), id, createdBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not create reset token")
		return
	}
	resetURL := h.adminBaseURL + "/reset-password?token=" + raw

	if h.mailer != nil {
		h.mailer.AdminPasswordReset(op.Email, op.FullName, resetURL)
	}
	// Log only that a reset was issued — never the token/link.
	slog.InfoContext(r.Context(), "admin.password_reset_issued", "admin_user_id", id)

	out := map[string]any{"ok": true, "expires_at": exp, "email_sent_to": op.Email}
	if h.showLink {
		// SMTP not configured / dry-run: hand the link to the SUPER_ADMIN over
		// the authenticated HTTPS response so they can deliver it.
		out["reset_url"] = resetURL
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /admin/v1/auth/password-reset/validate (public)
func (h *ResetHandler) Validate(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	info, err := h.store.ValidateResetToken(r.Context(), body.Token)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not validate token")
		return
	}
	out := map[string]any{"reason": info.Reason, "valid": info.Reason == service.ResetValid}
	if info.Reason == service.ResetValid {
		out["full_name"] = info.FullName
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /admin/v1/auth/password-reset/complete (public)
func (h *ResetHandler) Complete(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.NewPassword) < auth.MinPasswordLen {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 12 characters")
		return
	}
	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "WEAK_PASSWORD", "new password must be at least 12 characters")
		return
	}
	reason, err := h.store.CompleteReset(r.Context(), body.Token, hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not set password")
		return
	}
	if reason != service.ResetValid {
		// INVALID / USED / EXPIRED — 400 with the reason code.
		writeError(w, http.StatusBadRequest, "INVALID_TOKEN_"+reason, "reset link is no longer valid")
		return
	}
	// Does not create a session — the operator signs in with the new password.
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
