package middleware

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Logger emits a structured log line for every request after it completes.
// It captures status code, method, path, duration, and request ID.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rw, r)

		// correlation_id + request_id are injected by obs.NewContextHandler.
		slog.InfoContext(r.Context(), "request",
			"method", r.Method,
			"path", LoggedPath(r.URL.Path),
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote_ip", r.RemoteAddr,
		)
	})
}

// statusWriter wraps ResponseWriter to capture the status code written by the handler.
type statusWriter struct {
	http.ResponseWriter
	status  int
	written bool
}

func (sw *statusWriter) WriteHeader(code int) {
	if !sw.written {
		sw.status = code
		sw.written = true
	}
	sw.ResponseWriter.WriteHeader(code)
}

// publicProofPrefix is the public proof lookup. Its last segment is the proof
// reference, and a SECURE_V1 reference is a bearer capability: whoever holds
// it can read the payment. The access log wrote it whole on every lookup.
const publicProofPrefix = "/v1/public/proofs/"

// LoggedPath is the request path as it may appear in a log: a proof reference
// keeps its first two groups (enough to tell requests apart and to tell the
// reference class) and loses the rest.
func LoggedPath(path string) string {
	if !strings.HasPrefix(path, publicProofPrefix) {
		return path
	}
	ref := strings.TrimPrefix(path, publicProofPrefix)
	if len(ref) > 8 {
		ref = ref[:8] + "…"
	}
	return publicProofPrefix + ref
}
