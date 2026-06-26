package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

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
}

type OperatorHandler struct {
	ops OperatorStore
}

func NewOperatorHandler(ops OperatorStore) *OperatorHandler { return &OperatorHandler{ops: ops} }

func (h *OperatorHandler) ready(w http.ResponseWriter) bool {
	if h.ops == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "operator management is not available")
		return false
	}
	return true
}

// requireSuperAdmin enforces role on the server (not just the UI).
func requireSuperAdmin(w http.ResponseWriter, r *http.Request) bool {
	p, ok := auth.FromContext(r.Context())
	if !ok || p.Role != "SUPER_ADMIN" {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "requires SUPER_ADMIN")
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
	if !h.ready(w) || !requireSuperAdmin(w, r) {
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
	writeJSON(w, http.StatusCreated, o)
}

// PATCH /admin/v1/operators/{id} (SUPER_ADMIN) — update full_name
func (h *OperatorHandler) Update(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) || !requireSuperAdmin(w, r) {
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
	h.returnOperator(w, r, chi.URLParam(r, "id"))
}

// POST /admin/v1/operators/{id}/role (SUPER_ADMIN)
func (h *OperatorHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) || !requireSuperAdmin(w, r) {
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
	h.returnOperator(w, r, id)
}

// POST /admin/v1/operators/{id}/suspend (SUPER_ADMIN)
func (h *OperatorHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) || !requireSuperAdmin(w, r) {
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
	h.returnOperator(w, r, id)
}

// POST /admin/v1/operators/{id}/activate (SUPER_ADMIN)
func (h *OperatorHandler) Activate(w http.ResponseWriter, r *http.Request) {
	if !h.ready(w) || !requireSuperAdmin(w, r) {
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.ops.SetOperatorStatus(r.Context(), id, "ACTIVE", actorOf(r)); err != nil {
		h.opErr(w, err)
		return
	}
	h.returnOperator(w, r, id)
}

func (h *OperatorHandler) returnOperator(w http.ResponseWriter, r *http.Request, id string) {
	o, err := h.ops.GetOperator(r.Context(), id)
	if err != nil {
		h.opErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}
