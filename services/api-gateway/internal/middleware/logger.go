package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/banzami/banzami/services/common/obs"
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

// LoggedPath is the request path as it may appear in a log: bearer values
// (proof references on ANY route, API keys) are cut — see obs.RedactPath.
//
// It used to mask only paths starting /v1/public/proofs/, so a mistyped route
// (/V1/…, //v1/…) wrote the full reference to the log.
func LoggedPath(path string) string { return obs.RedactPath(path) }
