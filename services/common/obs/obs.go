// Package obs is the single source of truth for request/flow correlation across
// the Banzami operator services (gateway, public-api, admin-api) and into core-api.
//
// Two ids travel with every request:
//   - correlation_id — the FLOW id, generated once at the edge and PRESERVED across
//     every service hop, so one user action can be reconstructed end-to-end.
//   - request_id     — LOCAL to each service, generated fresh on every hop.
//
// Rule: a service preserves an incoming correlation_id and only generates one when
// absent; it never mints a new correlation_id when one is already present.
package obs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
)

const (
	HeaderCorrelationID = "X-Correlation-ID"
	HeaderRequestID     = "X-Request-ID"
)

type ctxKey int

const (
	correlationKey ctxKey = iota
	requestKey
)

// newID returns a 128-bit random hex id (non-secret, just for tracing).
func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "00000000000000000000000000000000"
	}
	return hex.EncodeToString(b)
}

// Correlation is HTTP middleware: preserve an incoming X-Correlation-ID (the flow id
// that spans services) or generate one; always assign a fresh per-service request_id.
// Both are stored in the context and echoed as response headers.
func Correlation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cid := r.Header.Get(HeaderCorrelationID)
		if cid == "" {
			cid = newID()
		}
		rid := newID() // request_id is service-local — never inherited from upstream
		ctx := context.WithValue(r.Context(), correlationKey, cid)
		ctx = context.WithValue(ctx, requestKey, rid)
		w.Header().Set(HeaderCorrelationID, cid)
		w.Header().Set(HeaderRequestID, rid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// CorrelationID returns the flow id from a context populated by Correlation.
func CorrelationID(ctx context.Context) string { s, _ := ctx.Value(correlationKey).(string); return s }

// RequestID returns the per-service request id.
func RequestID(ctx context.Context) string { s, _ := ctx.Value(requestKey).(string); return s }

// WithCorrelationID seeds a context for non-HTTP entrypoints (workers, tests).
func WithCorrelationID(ctx context.Context, cid string) context.Context {
	if cid == "" {
		cid = newID()
	}
	return context.WithValue(ctx, correlationKey, cid)
}

// ContextHandler wraps a slog.Handler and injects correlation_id + request_id from
// the context into every record, so every slog.*Context call is traceable without
// per-call boilerplate. It adds ONLY these two non-secret ids — never request bodies,
// headers, tokens, signed URLs or storage keys.
type ContextHandler struct{ slog.Handler }

// NewContextHandler wraps base so log records carry the flow ids from their context.
func NewContextHandler(base slog.Handler) *ContextHandler { return &ContextHandler{base} }

func (h *ContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if cid := CorrelationID(ctx); cid != "" {
		r.AddAttrs(slog.String("correlation_id", cid))
	}
	if rid := RequestID(ctx); rid != "" {
		r.AddAttrs(slog.String("request_id", rid))
	}
	return h.Handler.Handle(ctx, r)
}

func (h *ContextHandler) WithAttrs(as []slog.Attr) slog.Handler {
	return &ContextHandler{h.Handler.WithAttrs(as)}
}
func (h *ContextHandler) WithGroup(name string) slog.Handler {
	return &ContextHandler{h.Handler.WithGroup(name)}
}

// PropagationTransport copies the context's correlation_id onto outbound requests as
// X-Correlation-ID so downstream services join the same flow. It never generates a
// new correlation id (one flow id end-to-end) and never overwrites an existing header.
type PropagationTransport struct{ Base http.RoundTripper }

// NewPropagationTransport wraps base (or http.DefaultTransport when nil).
func NewPropagationTransport(base http.RoundTripper) *PropagationTransport {
	if base == nil {
		base = http.DefaultTransport
	}
	return &PropagationTransport{Base: base}
}

func (t *PropagationTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if cid := CorrelationID(req.Context()); cid != "" && req.Header.Get(HeaderCorrelationID) == "" {
		req = req.Clone(req.Context())
		req.Header.Set(HeaderCorrelationID, cid)
	}
	return t.Base.RoundTrip(req)
}
