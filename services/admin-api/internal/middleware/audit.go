package middleware

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// AuditWriter appends to the immutable admin audit log. *service.AuditService
// satisfies it; a nil writer disables auditing.
type AuditWriter interface {
	Write(ctx context.Context, e service.AuditEntry)
}

// Audit records one immutable admin_audit_log row for every state-changing
// request in the protected group (POST/PUT/PATCH/DELETE). The action is derived
// from the matched chi route so coverage is automatic — adding a route without a
// mapping still audits (it falls back to "METHOD pattern"), so nothing slips
// through unaudited. Handlers may enrich the row (before/after snapshot, entity)
// via auth.AuditAnnotation. Auditing never blocks or alters the response.
func Audit(sink AuditWriter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if sink == nil || !isMutation(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			ctx, ann := auth.WithAuditAnnotation(r.Context())
			r = r.WithContext(ctx)
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			if ann.Skip {
				return
			}
			rctx := chi.RouteContext(r.Context())
			pattern := ""
			if rctx != nil {
				pattern = rctx.RoutePattern()
			}
			action := auditAction(r.Method, pattern)
			entityType, entityID := auditEntity(r, pattern)
			if ann.Action != "" {
				action = ann.Action
			}
			if ann.EntityType != "" {
				entityType = ann.EntityType
			}
			if ann.EntityID != "" {
				entityID = ann.EntityID
			}

			p, _ := auth.FromContext(r.Context())
			sink.Write(r.Context(), service.AuditEntry{
				AdminUserID: p.ID,
				AdminEmail:  p.Email,
				FullName:    p.FullName,
				Role:        p.Role,
				Action:      action,
				EntityType:  entityType,
				EntityID:    entityID,
				Before:      ann.Before,
				After:       ann.After,
				StatusCode:  ww.Status(),
				IP:          realIP(r),
				UserAgent:   r.UserAgent(),
				RequestID:   chimiddleware.GetReqID(r.Context()),
			})
		})
	}
}

func isMutation(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

// auditActions maps "METHOD route-pattern" to a stable action name. A missing
// entry falls back to "METHOD pattern" so new routes are still audited.
var auditActions = map[string]string{
	"POST /admin/v1/finance/pricing-rules":                  "CREATE_PRICING_RULE",
	"PATCH /admin/v1/finance/pricing-rules/{id}":            "UPDATE_PRICING_RULE",
	"POST /admin/v1/finance/pricing-rules/{id}/disable":     "DISABLE_PRICING_RULE",
	"POST /admin/v1/finance/pricing-rules/{id}/enable":      "ENABLE_PRICING_RULE",
	"POST /admin/v1/finance/pricing-rules/{id}/duplicate":   "DUPLICATE_PRICING_RULE",
	"POST /admin/v1/auth/change-password":                 "CHANGE_PASSWORD",
	"POST /admin/v1/auth/logout":                          "LOGOUT",
	"POST /admin/v1/auth/terminate-sessions":              "TERMINATE_SESSIONS",
	"POST /admin/v1/operators":                            "CREATE_OPERATOR",
	"PATCH /admin/v1/operators/{id}":                      "UPDATE_OPERATOR",
	"POST /admin/v1/operators/{id}/role":                  "SET_OPERATOR_ROLE",
	"POST /admin/v1/operators/{id}/suspend":               "SUSPEND_OPERATOR",
	"POST /admin/v1/operators/{id}/activate":              "ACTIVATE_OPERATOR",
	"POST /admin/v1/operators/{id}/resend-invite":         "RESEND_INVITE",
	"POST /admin/v1/operators/{id}/password-reset":        "RESET_PASSWORD",
	"POST /admin/v1/operators/{id}/terminate-sessions":    "TERMINATE_OPERATOR_SESSIONS",
	"POST /admin/v1/merchants":                            "CREATE_MERCHANT",
	"DELETE /admin/v1/merchants/{id}":                     "DELETE_MERCHANT",
	"PATCH /admin/v1/merchants/{id}/verified":             "SET_MERCHANT_VERIFIED",
	"POST /admin/v1/merchants/{id}/api-keys":              "CREATE_API_KEY",
	"POST /admin/v1/merchants/{id}/resend-credentials":    "RESEND_CREDENTIALS",
	"POST /admin/v1/merchants/{id}/wallets":               "CREATE_WALLET",
	"POST /admin/v1/merchant-applications/{id}/approve":   "APPROVE_APPLICATION",
	"POST /admin/v1/merchant-applications/{id}/reject":    "REJECT_APPLICATION",
	"POST /admin/v1/merchant-applications/{id}/documents/{documentId}/read-url": "VIEW_KYB_DOCUMENT",
	"POST /admin/v1/merchant-applications/{id}/documents/{documentId}/accept":   "APPROVE_KYB",
	"POST /admin/v1/merchant-applications/{id}/documents/{documentId}/reject":   "REJECT_KYB",
	"POST /admin/v1/wallets/{id}/credit":                  "WALLET_CREDIT",
	"POST /admin/v1/consumers/{id}/suspend":               "SUSPEND_CONSUMER",
	"PATCH /admin/v1/consumers/{id}/badge":                "SET_CONSUMER_BADGE",
	"POST /admin/v1/compliance/merchants/{id}/approve":    "COMPLIANCE_APPROVE_MERCHANT",
	"POST /admin/v1/compliance/merchants/{id}/reject":     "COMPLIANCE_REJECT_MERCHANT",
	"POST /admin/v1/compliance/merchants/{id}/suspend":    "SUSPEND_MERCHANT",
	"POST /admin/v1/compliance/merchants/{id}/flag-aml":   "AML_FLAG",
	"POST /admin/v1/settlements":                          "CREATE_SETTLEMENT",
	"POST /admin/v1/settlements/{id}/submit":              "SETTLEMENT_SUBMIT",
	"POST /admin/v1/settlements/{id}/confirm":             "SETTLEMENT_CONFIRM",
	"POST /admin/v1/settlements/{id}/fail":                "SETTLEMENT_FAIL",
	"POST /admin/v1/payouts/{id}/process":                 "PAYMENT_PROCESS",
	"POST /admin/v1/payouts/{id}/sent":                    "PAYMENT_SENT",
	"POST /admin/v1/payouts/{id}/confirm":                 "PAYMENT_CONFIRM",
	"POST /admin/v1/payouts/{id}/fail":                    "PAYMENT_FAIL",
	"POST /admin/v1/payouts/{id}/returned":                "PAYMENT_RETURN",
	"POST /admin/v1/reconciliation/run":                   "RECONCILIATION_RUN",
	"POST /admin/v1/risk/freeze":                          "RISK_FREEZE",
	"DELETE /admin/v1/risk/freeze/{entity_type}/{entity_id}": "RISK_UNFREEZE",
	"POST /admin/v1/risk/flags/{id}/resolve":              "RISK_RESOLVE",
	"POST /admin/v1/risk/acquiring-recon":                 "ACQUIRING_RECON_RUN",
	"POST /admin/v1/disputes/{id}/resolve":                "DISPUTE_RESOLVE",
}

func auditAction(method, pattern string) string {
	if a, ok := auditActions[method+" "+pattern]; ok {
		return a
	}
	if pattern == "" {
		return method
	}
	return method + " " + pattern
}

// auditEntity infers the entity type from the route's first resource segment and
// the id from the most specific path param.
func auditEntity(r *http.Request, pattern string) (string, string) {
	entityType := entityTypeFromPattern(pattern)
	for _, key := range []string{"documentId", "entity_id", "id"} {
		if v := chi.URLParam(r, key); v != "" {
			return entityType, v
		}
	}
	return entityType, ""
}

func entityTypeFromPattern(pattern string) string {
	const prefix = "/admin/v1/"
	if len(pattern) <= len(prefix) || pattern[:len(prefix)] != prefix {
		return ""
	}
	rest := pattern[len(prefix):]
	end := indexByte(rest, '/')
	if end < 0 {
		return rest
	}
	return rest[:end]
}
