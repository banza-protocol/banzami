package auth

import "context"

// AuditAnnotation lets a handler enrich the audit row the audit middleware will
// write for the current request — e.g. attach a redacted before/after snapshot
// or override the entity. The middleware seeds an empty annotation into the
// context before the handler runs and reads it back afterwards. Never put
// passwords, hashes or tokens in Before/After.
type AuditAnnotation struct {
	Action     string // override the route-derived action name (optional)
	EntityType string
	EntityID   string
	Before     any
	After      any
	Skip       bool // handler opted this request out of auditing
}

type auditKey struct{}

// WithAuditAnnotation seeds a fresh annotation holder and returns the new context
// plus the pointer the middleware will read after the handler returns.
func WithAuditAnnotation(ctx context.Context) (context.Context, *AuditAnnotation) {
	a := &AuditAnnotation{}
	return context.WithValue(ctx, auditKey{}, a), a
}

// AuditFromContext returns the request's annotation holder, if the middleware
// seeded one. Handlers mutate the returned pointer in place.
func AuditFromContext(ctx context.Context) (*AuditAnnotation, bool) {
	a, ok := ctx.Value(auditKey{}).(*AuditAnnotation)
	return a, ok
}
