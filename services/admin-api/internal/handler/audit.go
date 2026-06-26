package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// Audit annotation helpers. The Audit middleware seeds an annotation holder into
// the request context; these let a handler enrich the row it will write with a
// redacted before/after snapshot and a semantic entity. They are safe no-ops when
// no holder is present (e.g. unit tests that don't mount the middleware).
//
// NEVER put secrets in these payloads: no API keys, activation/reset tokens,
// passwords, hashes, token_hash, or signed R2 URLs.

// auditAnnotate runs fn against the request's audit annotation, if any.
func auditAnnotate(r *http.Request, fn func(*auth.AuditAnnotation)) {
	if a, ok := auth.AuditFromContext(r.Context()); ok {
		fn(a)
	}
}

// auditEntity overrides the audited entity (type + id).
func auditEntity(r *http.Request, entityType, entityID string) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.EntityType = entityType
		a.EntityID = entityID
	})
}

// auditChange records a before/after snapshot for the audited entity.
func auditChange(r *http.Request, entityType, entityID string, before, after any) {
	auditAnnotate(r, func(a *auth.AuditAnnotation) {
		a.EntityType = entityType
		a.EntityID = entityID
		a.Before = before
		a.After = after
	})
}

// auditAfter records an after-only payload (metadata of the action just taken).
func auditAfter(r *http.Request, entityType, entityID string, after any) {
	auditChange(r, entityType, entityID, nil, after)
}
