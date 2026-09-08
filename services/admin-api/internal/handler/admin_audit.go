package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// AdminAuditHandler exposes admin_audit_log for reading.
//
// The trail has always been written and never read: no route returned it, so
// the only way to answer "who changed this pricing rule" was a psql session on
// the host. That is the operator SQL workaround this console exists to remove.
type AdminAuditHandler struct {
	audit *service.AuditService
}

func NewAdminAuditHandler(a *service.AuditService) *AdminAuditHandler {
	return &AdminAuditHandler{audit: a}
}

// GET /admin/v1/audit-log
//
// Filters: actor (email), action, entity_type, entity_id, limit, before (RFC3339).
// Newest first; `before` is the created_at of the last row of the previous page.
func (h *AdminAuditHandler) Query(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.audit == nil {
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "the audit trail is not configured")
		return
	}
	q := r.URL.Query()
	aq := service.AuditQuery{
		Actor:      q.Get("actor"),
		Action:     q.Get("action"),
		EntityType: q.Get("entity_type"),
		EntityID:   q.Get("entity_id"),
	}
	if raw := q.Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			aq.Limit = n
		}
	}
	if raw := q.Get("before"); raw != "" {
		t, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_PARAM", "before must be an RFC3339 timestamp")
			return
		}
		aq.Before = &t
	}

	rows, err := h.audit.QueryAudit(r.Context(), aq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "the audit trail could not be read")
		return
	}

	// next_before is the cursor for the following page — the created_at of the
	// last row returned. Absent when the page was not full, so a caller can stop
	// without a second request that returns nothing.
	out := map[string]any{"data": rows}
	if len(rows) > 0 && (aq.Limit == 0 || len(rows) == aq.Limit || len(rows) == 100) {
		out["next_before"] = rows[len(rows)-1].CreatedAt
	}
	writeJSON(w, http.StatusOK, out)
}
