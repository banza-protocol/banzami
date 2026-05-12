package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

// Logger emits a structured log line for every request after it completes.
// It captures status code, method, path, duration, and request ID.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rw, r)

		slog.InfoContext(r.Context(), "request",
			"method",      r.Method,
			"path",        r.URL.Path,
			"status",      rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id",  GetRequestID(r.Context()),
			"remote_ip",   r.RemoteAddr,
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
