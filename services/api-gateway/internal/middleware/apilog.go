package middleware

// Project-scoped Developer API request logging.
//
// The Console's Logs screen had nothing to show because nothing recorded what a
// developer's key actually called. This middleware is that record, and it lives
// here rather than in handlers for one reason: a log that depends on every
// handler remembering to emit a row is a log with holes exactly where the
// unusual request was. Attribution is set in resolveDeveloperPrincipal — the
// single place a developer key is ever accepted — and the entry is written by
// this middleware after the response is complete, so failures (403, 404, 422,
// 500, panics recovered downstream) are logged for the same reason successes
// are: they are what the developer is trying to debug.
//
// A request that fails AUTHENTICATION is not written here. There is no project
// to attribute it to — and inventing one would let an unauthenticated caller
// write rows into a stranger's log. Those stay in the gateway's structured logs.
//
// Recording never blocks and never fails the request: the sink hands the entry
// to a background writer. A payment must not fail because telemetry was slow.

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/obs"
)

// requestAttribution is the mutable holder installed by APIRequestLog and filled
// in by developer-key authentication further down the chain. A plain context
// value cannot work here: the principal is added to a DERIVED context that this
// middleware never sees.
type requestAttribution struct {
	projectID   string
	keyID       string
	environment string
}

type attributionKey struct{}

// AttributeRequest records the authenticated project against the in-flight
// request's log entry. Safe to call when no logging middleware is installed.
func AttributeRequest(ctx context.Context, p *DeveloperPrincipal) {
	a, _ := ctx.Value(attributionKey{}).(*requestAttribution)
	if a == nil || p == nil {
		return
	}
	a.projectID, a.keyID, a.environment = p.ProjectID, p.KeyID, p.Environment
}

// credentialInPath matches a Banzami key shape anywhere in a URL path. Auth
// reads keys from headers, so a key in the path means a caller put it there —
// and a log that then stored it would have turned their mistake into ours.
var credentialInPath = regexp.MustCompile(`bz_(test|live)_(sk|pk)_[A-Za-z0-9_-]+`)

// sanitisePath strips the query string and redacts anything key-shaped.
func sanitisePath(p string) string {
	if i := strings.IndexByte(p, '?'); i >= 0 {
		p = p[:i]
	}
	p = credentialInPath.ReplaceAllString(p, "[REDACTED]")
	if len(p) > 512 {
		p = p[:512]
	}
	return p
}

// APIRequestLog records one row per Developer-API request that authenticated
// with a project credential. sink may be nil (logging disabled).
func APIRequestLog(sink service.APIRequestLogSink) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if sink == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attr := &requestAttribution{}
			ctx := context.WithValue(r.Context(), attributionKey{}, attr)
			rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			start := time.Now()

			next.ServeHTTP(rw, r.WithContext(ctx))

			// No project ⇒ not a Developer API request (a merchant JWT, an
			// internal call, or a credential that never authenticated).
			if attr.projectID == "" {
				return
			}
			route := ""
			// Read AFTER routing: chi fills the pattern in as it descends.
			if rctx := chi.RouteContext(ctx); rctx != nil {
				route = rctx.RoutePattern()
			}
			sink.Record(service.APIRequestLogEntry{
				ProjectID:   attr.projectID,
				KeyID:       attr.keyID,
				Environment: attr.environment,
				Method:      r.Method,
				Path:        sanitisePath(r.URL.Path),
				Route:       route,
				Status:      rw.status,
				RequestID:   obs.RequestID(ctx),
				LatencyMS:   int(time.Since(start).Milliseconds()),
				At:          start.UTC(),
			})
		})
	}
}
