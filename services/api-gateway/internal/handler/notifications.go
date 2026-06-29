package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// NotificationsHandler serves the operator review-queue summary on the internal
// surface (admin-api only). Counts only — no PII.
type NotificationsHandler struct {
	svc *service.NotificationsService
}

func NewNotificationsHandler(svc *service.NotificationsService) *NotificationsHandler {
	return &NotificationsHandler{svc: svc}
}

// GET /internal/v1/notifications/summary
func (h *NotificationsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": map[string]string{"code": "UNAVAILABLE", "message": "summary unavailable"},
		})
		return
	}
	sum, err := h.svc.Summary(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error": map[string]string{"code": "SUMMARY_FAILED", "message": "could not compute summary"},
		})
		return
	}
	writeJSON(w, http.StatusOK, sum)
}
