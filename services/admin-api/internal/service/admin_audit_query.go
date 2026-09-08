package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// AuditRow is one row of admin_audit_log as it is read back.
//
// The trail was write-only: every operator action has been recorded since the
// table existed, and no route read it. An audit trail nobody can read is a log
// file, not a control — the point of recording who changed a pricing rule is
// that someone can go and see who changed a pricing rule.
type AuditRow struct {
	ID          string          `json:"id"`
	AdminUserID *string         `json:"admin_user_id,omitempty"`
	AdminEmail  string          `json:"admin_email"`
	FullName    string          `json:"full_name,omitempty"`
	Role        string          `json:"role,omitempty"`
	Action      string          `json:"action"`
	EntityType  string          `json:"entity_type,omitempty"`
	EntityID    string          `json:"entity_id,omitempty"`
	Before      json.RawMessage `json:"before,omitempty"`
	After       json.RawMessage `json:"after,omitempty"`
	StatusCode  int             `json:"status_code"`
	IP          string          `json:"ip_address,omitempty"`
	UserAgent   string          `json:"user_agent,omitempty"`
	RequestID   string          `json:"request_id,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// AuditQuery narrows the trail. Every field is optional; an empty query returns
// the most recent entries.
type AuditQuery struct {
	Actor      string // admin_email, exact
	Action     string // action, exact
	EntityType string
	EntityID   string
	Limit      int
	Before     *time.Time // keyset pagination: created_at < Before
}

// QueryAudit reads the trail newest-first.
//
// Keyset pagination on created_at rather than OFFSET: the table only grows, and
// an offset walk over an append-only log silently skips or repeats rows as new
// ones arrive while a reader pages through.
func (s *AuditService) QueryAudit(ctx context.Context, q AuditQuery) ([]AuditRow, error) {
	if s == nil || s.pool == nil {
		return nil, fmt.Errorf("audit service is not configured")
	}
	limit := q.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	var (
		where []string
		args  []any
	)
	add := func(clause string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if q.Actor != "" {
		add("admin_email = $%d", strings.ToLower(strings.TrimSpace(q.Actor)))
	}
	if q.Action != "" {
		add("action = $%d", q.Action)
	}
	if q.EntityType != "" {
		add("entity_type = $%d", q.EntityType)
	}
	if q.EntityID != "" {
		add("entity_id = $%d", q.EntityID)
	}
	if q.Before != nil {
		add("created_at < $%d", *q.Before)
	}

	sql := `SELECT id, admin_user_id, admin_email, COALESCE(full_name,''), COALESCE(role,''),
	               action, COALESCE(entity_type,''), COALESCE(entity_id,''),
	               before_json, after_json, COALESCE(status_code,0),
	               COALESCE(ip_address,''), COALESCE(user_agent,''), COALESCE(request_id,''),
	               created_at
	          FROM admin_audit_log`
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit)
	sql += fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", len(args))

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AuditRow, 0, limit)
	for rows.Next() {
		var r AuditRow
		if err := rows.Scan(&r.ID, &r.AdminUserID, &r.AdminEmail, &r.FullName, &r.Role,
			&r.Action, &r.EntityType, &r.EntityID, &r.Before, &r.After, &r.StatusCode,
			&r.IP, &r.UserAgent, &r.RequestID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
