package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// OperatorStore is the slice of AdminUserService the operator handler needs.
type OperatorStore interface {
	ListOperators(ctx context.Context) ([]service.OperatorView, error)
	GetOperator(ctx context.Context, id string) (service.OperatorView, error)
	CreateOperator(ctx context.Context, email, fullName, role, createdBy string) (string, error)
	UpdateOperatorName(ctx context.Context, id, fullName, updatedBy string) error
	SetOperatorRole(ctx context.Context, id, role, updatedBy string) error
	SetOperatorStatus(ctx context.Context, id, status, updatedBy string) error
	CountActiveSuperAdmins(ctx context.Context) (int, error)
	CreateInviteToken(ctx context.Context, adminUserID, createdBy string) (string, time.Time, error)
	BumpTokenVersion(ctx context.Context, id string) error
}

// OperatorMailer sends the invitation email.
type OperatorMailer interface {
	AdminOperatorInvite(to, fullName, inviteURL string)
}

type OperatorHandler struct {
	ops          OperatorStore
	mailer       OperatorMailer
	adminBaseURL string
	showLink     bool // dry-run / SMTP off → return invite_url to the SUPER_ADMIN
}

func NewOperatorHandler(ops OperatorStore, mailer OperatorMailer, adminBaseURL string, showLink bool) *OperatorHandler {
	return &OperatorHandler{ops: ops, mailer: mailer, adminBaseURL: adminBaseURL, showLink: showLink}
}

func principalID(r *http.Request) string {
	if p, ok := auth.FromContext(r.Context()); ok {
		return p.ID
	}
	return ""
}

// sendInvite issues an INVITE token for op and emails it. Returns the invite URL
// (only surfaced to the SUPER_ADMIN when email is dry-run/off).
func (h *OperatorHandler) sendInvite(r *http.Request, op service.OperatorView) (string, time.Time, error) {
	raw, exp, err := h.ops.CreateInviteToken(r.Context(), op.ID, principalID(r))
	if err != nil {
		return "", time.Time{}, err
	}
	inviteURL := h.adminBaseURL + "/reset-password?token=" + raw
	if h.mailer != nil {
		h.mailer.AdminOperatorInvite(op.Email, op.FullName, inviteURL)
	}
	slog.InfoContext(r.Context(), "admin.operator_invited", "admin_user_id", op.ID) // never the token/link
	return inviteURL, exp, nil
}

func (h *OperatorHandler) ready(w http.ResponseWriter) bool {
	if h.ops == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "operator management is not available")
		return false
	}
	return true
}

func (h *OperatorHandler) opErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrAdminUserNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", "operator not found")
	case errors.Is(err, service.ErrAdminUserExists):
		writeError(w, http.StatusConflict, "EMAIL_EXISTS", "an operator with that email already exists")
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "operator operation failed")
	}
}

// GET /admin/v1/operators — any authenticated operator may read.
func (h *OperatorHandler) List(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	list, err := h.ops.ListOperators(r.Context())
	if err != nil {
		h.opErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"operators": list})
}

// GET /admin/v1/operators/{id}
func (h *OperatorHandler) Get(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	o, err := h.ops.GetOperator(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.opErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

// POST /admin/v1/operators (SUPER_ADMIN)
func (h *OperatorHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Email    string `json:"email"`
		FullName string `json:"full_name"`
		Role     string `json:"role"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || strings.TrimSpace(body.FullName) == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "email and full_name are required")
		return
	}
	if !service.ValidRoles[body.Role] {
		writeError(w, http.StatusBadRequest, "INVALID_ROLE", "invalid role")
		return
	}
	id, err := h.ops.CreateOperator(r.Context(), email, strings.TrimSpace(body.FullName), body.Role, actorOf(r))
	if err != nil {
		h.opErr(w, err)
		return
	}
	o, err := h.ops.GetOperator(r.Context(), id)
	if err != nil {
		h.opErr(w, err)
		return
	}
	// New operator is INVITED — send the invite link to set a password.
	inviteURL, exp, err := h.sendInvite(r, o)
	if err != nil {
		h.opErr(w, err)
		return
	}
	auditAfter(r, "admin_user", o.ID, map[string]any{
		"action": "CREATE", "email": o.Email, "full_name": o.FullName, "role": o.Role, "status": "INVITED",
	})
	out := map[string]any{"operator": o, "email_sent_to": o.Email, "expires_at": exp}
	if h.showLink {
		out["invite_url"] = inviteURL
	}
	writeJSON(w, http.StatusCreated, out)
}

// POST /admin/v1/operators/{id}/resend-invite (SUPER_ADMIN)
func (h *OperatorHandler) ResendInvite(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	o, err := h.ops.GetOperator(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		h.opErr(w, err)
		return
	}
	// Only operators who haven't activated (still INVITED / no password) can be
	// re-invited; an active operator uses the password-reset flow instead.
	if o.Status != "INVITED" && o.PasswordSet {
		writeError(w, http.StatusConflict, "ALREADY_ACTIVE", "operator already has a password; use password reset")
		return
	}
	inviteURL, exp, err := h.sendInvite(r, o)
	if err != nil {
		h.opErr(w, err)
		return
	}
	auditAfter(r, "admin_user", o.ID, map[string]any{"action": "RESEND_INVITE", "email": o.Email})
	out := map[string]any{"ok": true, "email_sent_to": o.Email, "expires_at": exp}
	if h.showLink {
		out["invite_url"] = inviteURL
	}
	writeJSON(w, http.StatusOK, out)
}

// PATCH /admin/v1/operators/{id} (SUPER_ADMIN) — update full_name
func (h *OperatorHandler) Update(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		FullName string `json:"full_name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.FullName) == "" {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", "full_name is required")
		return
	}
	if err := h.ops.UpdateOperatorName(r.Context(), chi.URLParam(r, "id"), strings.TrimSpace(body.FullName), actorOf(r)); err != nil {
		h.opErr(w, err)
		return
	}
	auditAfter(r, "admin_user", chi.URLParam(r, "id"), map[string]any{"action": "UPDATE_NAME", "full_name": strings.TrimSpace(body.FullName)})
	h.returnOperator(w, r, chi.URLParam(r, "id"))
}

// POST /admin/v1/operators/{id}/role (SUPER_ADMIN)
func (h *OperatorHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !service.ValidRoles[body.Role] {
		writeError(w, http.StatusBadRequest, "INVALID_ROLE", "invalid role")
		return
	}
	id := chi.URLParam(r, "id")
	target, err := h.ops.GetOperator(r.Context(), id)
	if err != nil {
		h.opErr(w, err)
		return
	}
	// Cannot demote the last active SUPER_ADMIN.
	if target.Role == "SUPER_ADMIN" && target.Status == "ACTIVE" && body.Role != "SUPER_ADMIN" {
		if n, _ := h.ops.CountActiveSuperAdmins(r.Context()); n <= 1 {
			writeError(w, http.StatusConflict, "LAST_SUPER_ADMIN", "cannot demote the last active SUPER_ADMIN")
			return
		}
	}
	if err := h.ops.SetOperatorRole(r.Context(), id, body.Role, actorOf(r)); err != nil {
		h.opErr(w, err)
		return
	}
	auditChange(r, "admin_user", id,
		map[string]any{"role": target.Role},
		map[string]any{"role": body.Role})
	h.returnOperator(w, r, id)
}

// POST /admin/v1/operators/{id}/suspend (SUPER_ADMIN)
func (h *OperatorHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	id := chi.URLParam(r, "id")
	target, err := h.ops.GetOperator(r.Context(), id)
	if err != nil {
		h.opErr(w, err)
		return
	}
	// Cannot suspend the last active SUPER_ADMIN (covers suspending oneself).
	if target.Role == "SUPER_ADMIN" && target.Status == "ACTIVE" {
		if n, _ := h.ops.CountActiveSuperAdmins(r.Context()); n <= 1 {
			writeError(w, http.StatusConflict, "LAST_SUPER_ADMIN", "cannot suspend the last active SUPER_ADMIN")
			return
		}
	}
	if err := h.ops.SetOperatorStatus(r.Context(), id, "SUSPENDED", actorOf(r)); err != nil {
		h.opErr(w, err)
		return
	}
	auditChange(r, "admin_user", id,
		map[string]any{"status": target.Status},
		map[string]any{"status": "SUSPENDED"})
	h.returnOperator(w, r, id)
}

// POST /admin/v1/operators/{id}/activate (SUPER_ADMIN)
func (h *OperatorHandler) Activate(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.ops.SetOperatorStatus(r.Context(), id, "ACTIVE", actorOf(r)); err != nil {
		h.opErr(w, err)
		return
	}
	auditAfter(r, "admin_user", id, map[string]any{"status": "ACTIVE", "action": "ACTIVATE"})
	h.returnOperator(w, r, id)
}

// POST /admin/v1/operators/{id}/terminate-sessions — authorized via
// RequireCapability(CapOperatorReset). Increments the target's token_version so
// every session they hold is revoked immediately.
func (h *OperatorHandler) TerminateSessions(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) {
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := h.ops.GetOperator(r.Context(), id); err != nil {
		h.opErr(w, err)
		return
	}
	if err := h.ops.BumpTokenVersion(r.Context(), id); err != nil {
		h.opErr(w, err)
		return
	}
	auditAfter(r, "admin_user", id, map[string]any{"action": "TERMINATE_SESSIONS"})
	slog.InfoContext(r.Context(), "admin.operator_sessions_terminated", "admin_user_id", id)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *OperatorHandler) returnOperator(w http.ResponseWriter, r *http.Request, id string) {
	o, err := h.ops.GetOperator(r.Context(), id)
	if err != nil {
		h.opErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}
