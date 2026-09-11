package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// NotificationsHandler serves the operator Notification Center (ADR-022 s3):
// the persistent notifications in admin-api's own admin_notifications table,
// per environment. The bell's unread count travels with the attention summary
// (attention.go), so the sidebar and the bell make one request.
type NotificationsHandler struct {
	notif        *service.NotificationService // live notifications
	notifSandbox *service.NotificationService // sandbox notifications (optional)
}

func NewNotificationsHandler(notif, notifSandbox *service.NotificationService) *NotificationsHandler {
	return &NotificationsHandler{notif: notif, notifSandbox: notifSandbox}
}

// It answers the request itself when it returns false: 400 for an environment
// it does not recognise (requestedEnvironment, A2-22), 503 when the
// environment has no notification service.
func (h *NotificationsHandler) pickNotif(w http.ResponseWriter, r *http.Request) (*service.NotificationService, bool) {
	e, ok := requestedEnvironment(w, r)
	if !ok {
		return nil, false
	}
	n := h.notif
	if e.IsSandbox() {
		n = h.notifSandbox
	}
	if n == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "notifications are not configured for this environment")
		return nil, false
	}
	return n, true
}

// GET /admin/v1/notifications?environment=&status=&limit=
func (h *NotificationsHandler) List(w http.ResponseWriter, r *http.Request) {
	n, ok := h.pickNotif(w, r)
	if !ok {
		return
	}
	_ = n.Generate(r.Context())
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := n.List(r.Context(), r.URL.Query().Get("status"), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not list notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": items})
}

// POST /admin/v1/notifications/{id}/read?environment=
func (h *NotificationsHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	n, ok := h.pickNotif(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := n.MarkRead(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not update notification")
		return
	}
	notifAudit(r, "READ_NOTIFICATION", id)
	w.WriteHeader(http.StatusNoContent)
}

// POST /admin/v1/notifications/{id}/dismiss?environment=
func (h *NotificationsHandler) Dismiss(w http.ResponseWriter, r *http.Request) {
	n, ok := h.pickNotif(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if err := n.Dismiss(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "could not update notification")
		return
	}
	notifAudit(r, "DISMISS_NOTIFICATION", id)
	w.WriteHeader(http.StatusNoContent)
}

func notifAudit(r *http.Request, action, id string) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.Action = action
		a.EntityType = "admin_notification"
		a.EntityID = id
	})
}
