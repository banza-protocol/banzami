package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// PlatformHandler manages the central platform mode (SANDBOX/LIVE). Reads are
// open to any operator; only a SUPER_ADMIN may change the mode, with a typed
// confirmation + reason. Every change is audited.
type PlatformHandler struct {
	svc *service.PlatformService
}

func NewPlatformHandler(svc *service.PlatformService) *PlatformHandler {
	return &PlatformHandler{svc: svc}
}

// GET /admin/v1/platform/mode
func (h *PlatformHandler) Get(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "platform settings unavailable")
		return
	}
	writeJSON(w, http.StatusOK, h.svc.GetMode(r.Context()))
}

// POST /admin/v1/platform/mode   {mode, confirmation_text, reason}
func (h *PlatformHandler) Set(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "platform settings unavailable")
		return
	}
	p, _ := auth.FromContext(r.Context())
	// Only a SUPER_ADMIN may change the platform mode (beyond the route capability).
	if p.Role != "SUPER_ADMIN" {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only a SUPER_ADMIN can change the platform mode")
		return
	}
	var body struct {
		Mode             string `json:"mode"`
		ConfirmationText string `json:"confirmation_text"`
		Reason           string `json:"reason"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body)

	before := h.svc.GetMode(r.Context())
	mode, err := h.svc.SetMode(r.Context(), body.Mode, body.ConfirmationText, body.Reason, p.Actor())
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidMode):
			writeError(w, http.StatusBadRequest, "INVALID_MODE", err.Error())
		case errors.Is(err, service.ErrModeReasonRequired):
			writeError(w, http.StatusBadRequest, "REASON_REQUIRED", err.Error())
		case errors.Is(err, service.ErrConfirmationMismatch):
			writeError(w, http.StatusBadRequest, "CONFIRMATION_MISMATCH", "confirmation text is incorrect — nothing was changed")
		default:
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not change the platform mode")
		}
		return
	}
	// Audit: before/after + reason (the confirmation text is not a secret but adds
	// no value to the audit row; the reason is the meaningful record).
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = "PLATFORM_MODE_CHANGED"
		a.EntityType = "platform_setting"
		a.EntityID = "platform_mode"
		a.Before = map[string]any{"mode": before.Mode}
		a.After = map[string]any{"mode": mode.Mode, "reason": body.Reason}
	})
	writeJSON(w, http.StatusOK, mode)
}
