package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// NotificationsHandler serves the operator review-queue summary that drives the
// BANZADMIN sidebar badges. It proxies to the gateway (live or staging, per the
// environment toggle), which owns the data. Read-only — not audited.
type NotificationsHandler struct {
	gw        *service.GatewayClient // live gateway
	gwSandbox *service.GatewayClient // staging gateway (optional)
}

func NewNotificationsHandler(gw, gwSandbox *service.GatewayClient) *NotificationsHandler {
	return &NotificationsHandler{gw: gw, gwSandbox: gwSandbox}
}

func (h *NotificationsHandler) pick(r *http.Request) (*service.GatewayClient, bool) {
	if r.URL.Query().Get("environment") == "SANDBOX" {
		return h.gwSandbox, h.gwSandbox != nil
	}
	return h.gw, true
}

// GET /admin/v1/notifications/summary?environment=LIVE|SANDBOX
func (h *NotificationsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	gw, ok := h.pick(r)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "sandbox summary is not configured")
		return
	}
	raw, code, err := gw.NotificationSummaryRaw(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "BAD_GATEWAY", "could not compute summary")
		return
	}
	writeRaw(w, code, raw)
}
