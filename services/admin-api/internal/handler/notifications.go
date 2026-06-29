package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// NotificationsHandler serves the operator Notification Center (ADR-022 s3) and
// the sidebar review-queue summary. The summary's entity counts come from the
// gateway (live or staging); the persistent notifications + the bell's unread
// count come from admin-api's own admin_notifications table (per environment).
type NotificationsHandler struct {
	gw           *service.GatewayClient       // live gateway (entity counts)
	gwSandbox    *service.GatewayClient       // staging gateway (optional)
	notif        *service.NotificationService // live notifications
	notifSandbox *service.NotificationService // sandbox notifications (optional)
}

func NewNotificationsHandler(gw, gwSandbox *service.GatewayClient, notif, notifSandbox *service.NotificationService) *NotificationsHandler {
	return &NotificationsHandler{gw: gw, gwSandbox: gwSandbox, notif: notif, notifSandbox: notifSandbox}
}

func (h *NotificationsHandler) pickGW(r *http.Request) (*service.GatewayClient, bool) {
	if r.URL.Query().Get("environment") == "SANDBOX" {
		return h.gwSandbox, h.gwSandbox != nil
	}
	return h.gw, true
}

func (h *NotificationsHandler) pickNotif(r *http.Request) *service.NotificationService {
	if r.URL.Query().Get("environment") == "SANDBOX" {
		return h.notifSandbox
	}
	return h.notif
}

// GET /admin/v1/notifications/summary?environment=LIVE|SANDBOX
//
// Returns the gateway entity counts (sidebar badges) augmented with
// unread_notifications (the bell counter) from admin_notifications.
func (h *NotificationsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pickGW(r)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "sandbox summary is not configured")
		return
	}
	raw, code, err := gw.NotificationSummaryRaw(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "BAD_GATEWAY", "could not compute summary")
		return
	}
	// Augment with the unread notification count (best-effort: a failure here must
	// never break the badges).
	unread := 0
	if n := h.pickNotif(r); n != nil {
		_ = n.Generate(r.Context())
		if c, uerr := n.UnreadCount(r.Context()); uerr == nil {
			unread = c
		}
	}
	var m map[string]any
	if code == http.StatusOK && json.Unmarshal(raw, &m) == nil {
		m["unread_notifications"] = unread
		writeJSON(w, http.StatusOK, m)
		return
	}
	writeRaw(w, code, raw)
}

// GET /admin/v1/notifications?environment=&status=&limit=
func (h *NotificationsHandler) List(w http.ResponseWriter, r *http.Request) {
	n := h.pickNotif(r)
	if n == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "notifications are not configured for this environment")
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
	n := h.pickNotif(r)
	if n == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "notifications are not configured for this environment")
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
	n := h.pickNotif(r)
	if n == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "notifications are not configured for this environment")
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
