package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type TeamHandler struct {
	svc service.TeamService
}

func NewTeamHandler(svc service.TeamService) *TeamHandler {
	return &TeamHandler{svc: svc}
}

func (h *TeamHandler) merchant(w http.ResponseWriter, r *http.Request) (string, bool) {
	principal, ok := middleware.GetPrincipal(r.Context())
	if !ok || principal.MerchantID == "" {
		apierror.Respond(w, r, http.StatusForbidden, "FORBIDDEN", "merchant authentication required")
		return "", false
	}
	return principal.MerchantID, true
}

// List returns the merchant's active team members.
func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.merchant(w, r)
	if !ok {
		return
	}
	members, err := h.svc.ListMembers(r.Context(), merchantID)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list team members")
		return
	}
	if members == nil {
		members = []*service.TeamMember{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": members})
}

// Invite adds a team member by email with a permission role.
func (h *TeamHandler) Invite(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.merchant(w, r)
	if !ok {
		return
	}
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"` // VIEWER | OPERATOR; defaults to VIEWER
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Respond(w, r, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	member, err := h.svc.InviteMember(r.Context(), merchantID, body.Email, body.Role)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrDuplicateMember):
			apierror.Respond(w, r, http.StatusConflict, "DUPLICATE", "a team member with this email already exists")
		case errors.Is(err, service.ErrInvalidRole):
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_ROLE", "role must be VIEWER or OPERATOR")
		default:
			apierror.Respond(w, r, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		}
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

// Remove revokes a team member's access immediately.
func (h *TeamHandler) Remove(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.merchant(w, r)
	if !ok {
		return
	}
	if err := h.svc.RemoveMember(r.Context(), merchantID, chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, service.ErrMemberNotFound) {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "team member not found")
			return
		}
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to remove team member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AccessLog returns the merchant's per-member access/action audit trail.
func (h *TeamHandler) AccessLog(w http.ResponseWriter, r *http.Request) {
	merchantID, ok := h.merchant(w, r)
	if !ok {
		return
	}
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	entries, err := h.svc.ListAccessLog(r.Context(), merchantID, limit)
	if err != nil {
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list access log")
		return
	}
	if entries == nil {
		entries = []*service.AccessLogEntry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": entries})
}
