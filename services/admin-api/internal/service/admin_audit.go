package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditEntry is one immutable row in admin_audit_log. Before/After hold a
// redacted snapshot (never passwords, hashes or tokens) and may be nil.
type AuditEntry struct {
	AdminUserID string // "" → NULL (failed login / unknown email)
	AdminEmail  string
	FullName    string
	Role        string
	Action      string
	EntityType  string
	EntityID    string
	Before      any
	After       any
	StatusCode  int
	IP          string
	UserAgent   string
	RequestID   string
}

// AuditService appends to the immutable admin_audit_log. Writes are best-effort:
// a failed audit insert is logged but never blocks the action that triggered it.
type AuditService struct {
	pool *pgxpool.Pool
}

func NewAuditService(pool *pgxpool.Pool) *AuditService {
	return &AuditService{pool: pool}
}

// Write appends one audit row. The table is append-only — there is no Update or
// Delete counterpart by design.
func (s *AuditService) Write(ctx context.Context, e AuditEntry) {
	if s == nil || s.pool == nil {
		return
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO admin_audit_log
		   (id, admin_user_id, admin_email, full_name, role, action, entity_type, entity_id,
		    before_json, after_json, status_code, ip_address, user_agent, request_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		uuid.NewString(), nullStr(e.AdminUserID), nullStr(e.AdminEmail), nullStr(e.FullName),
		nullStr(e.Role), e.Action, nullStr(e.EntityType), nullStr(e.EntityID),
		jsonOrNil(e.Before), jsonOrNil(e.After), e.StatusCode,
		nullStr(e.IP), nullStr(e.UserAgent), nullStr(e.RequestID))
	if err != nil {
		// Never fail the request because auditing failed — record the gap loudly.
		slog.ErrorContext(ctx, "admin.audit_write_failed", "action", e.Action, "error", err)
	}
}

func jsonOrNil(v any) any {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}
