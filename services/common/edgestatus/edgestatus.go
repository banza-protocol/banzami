// Package edgestatus keeps an API's error body readable through Cloudflare.
//
// Cloudflare replaces the body of an origin response whose status is 502 or 504
// with its own page ("error code: 502"), measured on the deployed Sandbox on
// 2026-09-14; 500 and 503 pass through untouched. A developer behind the edge
// therefore never saw the JSON of UPSTREAM_ERROR, PAYMENT_NOT_CONFIRMED,
// RETIREMENT_FAILED or the simulated timeout — the code, the message and the
// request_id were gone, and only the status survived.
//
// Middleware answers such a response with 503 instead, body and headers
// unchanged, and records the status the handler chose in
// X-Banzami-Upstream-Status. 503 keeps what 502/504 told a client — the
// failure is on the server's side and the request may be retried with its
// Idempotency-Key — and the code in the body says which failure it is.
//
// Internal routes (service to service, never through the edge) are left alone,
// so a caller that branches on 502 keeps working.
package edgestatus

import (
	"net/http"
	"strconv"
	"strings"
)

// UpstreamStatusHeader carries the status the handler wrote before rewriting.
const UpstreamStatusHeader = "X-Banzami-Upstream-Status"

// Rewritten reports whether status is one the edge would replace.
func Rewritten(status int) bool {
	return status == http.StatusBadGateway || status == http.StatusGatewayTimeout
}

// Middleware rewrites 502/504 to 503 on every path outside skipPrefixes.
func Middleware(skipPrefixes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			for _, p := range skipPrefixes {
				if strings.HasPrefix(r.URL.Path, p) {
					next.ServeHTTP(w, r)
					return
				}
			}
			next.ServeHTTP(&writer{ResponseWriter: w}, r)
		})
	}
}

type writer struct {
	http.ResponseWriter
	wrote bool
}

func (w *writer) WriteHeader(status int) {
	if !w.wrote && Rewritten(status) {
		w.Header().Set(UpstreamStatusHeader, strconv.Itoa(status))
		status = http.StatusServiceUnavailable
	}
	w.wrote = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *writer) Write(b []byte) (int, error) {
	w.wrote = true
	return w.ResponseWriter.Write(b)
}

// Flush keeps streaming responses (Server-Sent Events) streaming.
func (w *writer) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the connection (write deadlines).
func (w *writer) Unwrap() http.ResponseWriter { return w.ResponseWriter }
