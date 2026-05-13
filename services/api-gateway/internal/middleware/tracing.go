package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// RouteSpan enriches the active OTel span (created by otelhttp at the server
// level) with the resolved chi route pattern. This gives spans a stable,
// low-cardinality name like "GET /v1/transactions/{id}" instead of the raw URL
// path, which would explode cardinality in tracing and metric backends.
func RouteSpan(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			if pattern := rctx.RoutePattern(); pattern != "" {
				span := trace.SpanFromContext(r.Context())
				span.SetName(r.Method + " " + pattern)
				span.SetAttributes(semconv.HTTPRoute(pattern))
			}
		}
		next.ServeHTTP(w, r)
	})
}
