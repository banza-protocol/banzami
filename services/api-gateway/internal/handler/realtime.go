package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/clientip"
)

// Realtime payment status (ADR-060 §9, REALTIME-001).
//
//	GET /v1/realtime/payment-sessions/{id}
//	Authorization: Bearer bzst_…
//	Accept: text/event-stream   → a stream
//	Accept: application/json    → one snapshot (the fallback read)
//
// WHAT IT IS NOT
//
// Not a source of financial truth. Every value sent is read from the canonical
// Payment Session (Core) — there is no second state machine here, and a stream
// that fails changes nothing about the payment. Webhooks remain the server
// notification; GET /v1/payment-sessions/{id} remains the reconciliation read.
//
// SHAPE OF A STREAM
//
//	retry: 3000
//	event: snapshot   the current status, always first
//	event: status     each change after that
//	: heartbeat       every RealtimeHeartbeat, a comment, never an event
//	event: expired    the token lifetime ended; the stream closes
//
// A terminal status (PAID, EXPIRED, CANCELLED, FAILED) is sent and the stream
// closes. A reconnect receives a fresh snapshot: this is current-state UX, not
// event history, so Last-Event-ID is accepted and simply answered with the
// current state.
//
// WHY A 5-SECOND HEARTBEAT
//
// A stream the client abandons (a reloaded page, a closed tab) holds one of the
// session's RealtimeMaxPerSession places until the server notices. Directly and
// through nginx it notices within about two seconds; through Cloudflare the
// origin connection stays open until the next write fails, so the heartbeat
// interval IS how long a dead stream keeps its place. At 15 s, a page reloaded
// three times was refused a stream for 15 s (measured on the deployed Sandbox,
// tools/e2e/sandbox/realtime-isolation-e2e.mjs). Retry-After on the 429 names the
// same interval: by then the place has been freed.
//
// WHY ONE WATCHER PER SESSION
//
// Any number of browsers watching one session share one canonical read per
// RealtimePollInterval. Load follows the number of sessions being watched, not
// the number of tabs.

const (
	RealtimePollInterval    = time.Second
	RealtimeHeartbeat       = 5 * time.Second
	RealtimeMaxPerSession   = 3
	RealtimeMaxPerIP        = 20
	realtimeStreamMediaType = "text/event-stream"
)

// terminalSessionStatus is the set of Payment Session states that do not change
// again (migration 0085's CHECK: CREATED, ACTIVE, PAID, PARTIALLY_PAID, EXPIRED,
// CANCELLED, FAILED).
func terminalSessionStatus(s string) bool {
	switch s {
	case "PAID", "EXPIRED", "CANCELLED", "FAILED":
		return true
	}
	return false
}

var (
	realtimeActiveStreams = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "banzami_realtime_active_streams", Help: "Open realtime payment status streams.",
	})
	realtimeStreamEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_realtime_stream_events_total", Help: "Realtime stream lifecycle outcomes.",
	}, []string{"outcome"})
)

type realtimeSessionReader interface {
	Get(ctx context.Context, id string) (*service.PaymentSession, error)
}

// RealtimeHandler serves status snapshots and streams.
type RealtimeHandler struct {
	tokens   *service.RealtimeTokens
	sessions realtimeSessionReader
	poll     time.Duration
	beat     time.Duration

	mu       sync.Mutex
	watchers map[string]*sessionWatcher
	perIP    map[string]int
}

func NewRealtimeHandler(tokens *service.RealtimeTokens, sessions realtimeSessionReader) *RealtimeHandler {
	return &RealtimeHandler{
		tokens: tokens, sessions: sessions, poll: RealtimePollInterval, beat: RealtimeHeartbeat,
		watchers: map[string]*sessionWatcher{}, perIP: map[string]int{},
	}
}

// realtimeStatus is what a browser learns: public Payment Session fields only.
// No merchant, wallet, account, Project or binding identifier appears here.
type realtimeStatus struct {
	SessionID   string  `json:"session_id"`
	Status      string  `json:"status"`
	AmountMinor *int64  `json:"amount_minor"`
	Currency    string  `json:"currency"`
	ExpiresAt   *string `json:"expires_at"`
	Terminal    bool    `json:"terminal"`
	ObservedAt  string  `json:"observed_at"`
}

func publicStatus(s *service.PaymentSession, now time.Time) realtimeStatus {
	return realtimeStatus{
		SessionID: s.SessionID, Status: s.Status, AmountMinor: s.AmountMinor, Currency: s.Currency,
		ExpiresAt: s.ExpiresAt, Terminal: terminalSessionStatus(s.Status), ObservedAt: now.UTC().Format(time.RFC3339),
	}
}

// setCORS allows any origin without credentials. The capability is the bearer
// token itself, scoped to one session's public status for at most 30 minutes;
// cookies are never involved, so a wildcard origin grants a page nothing the
// token does not already grant whoever holds it (threat model: docs/security/REALTIME_STATUS_THREAT_MODEL.md).
func setRealtimeCORS(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Authorization, Accept, Last-Event-ID")
	h.Set("Access-Control-Max-Age", "600")
	h.Set("Vary", "Origin")
}

func (h *RealtimeHandler) authorize(w http.ResponseWriter, r *http.Request, sessionID string) (time.Time, bool) {
	// The token is read from the Authorization header only. A token in the query
	// string would be written to access logs, proxies and Referer headers.
	if r.URL.Query().Has("token") || r.URL.Query().Has("access_token") {
		realtimeStreamEvents.WithLabelValues("token_in_query").Inc()
		apierror.Respond(w, r, http.StatusBadRequest, "REALTIME_TOKEN_IN_URL",
			"send the status token in the Authorization header, never in the URL")
		return time.Time{}, false
	}
	raw := strings.TrimSpace(r.Header.Get("Authorization"))
	token, ok := strings.CutPrefix(raw, "Bearer ")
	if !ok || token == "" {
		realtimeStreamEvents.WithLabelValues("unauthenticated").Inc()
		apierror.Respond(w, r, http.StatusUnauthorized, "REALTIME_TOKEN_REQUIRED",
			"Authorization: Bearer <status token> is required")
		return time.Time{}, false
	}
	exp, err := h.tokens.Verify(token, sessionID)
	switch {
	case err == nil:
		return exp, true
	case errors.Is(err, service.ErrRealtimeTokenExpired):
		realtimeStreamEvents.WithLabelValues("expired").Inc()
		apierror.Respond(w, r, http.StatusUnauthorized, "REALTIME_TOKEN_EXPIRED",
			"the status token has expired — read the Payment Session again for a new one")
	case errors.Is(err, service.ErrRealtimeTokenWrongResource):
		realtimeStreamEvents.WithLabelValues("wrong_resource").Inc()
		apierror.Respond(w, r, http.StatusForbidden, "REALTIME_TOKEN_WRONG_RESOURCE",
			"this status token is for another Payment Session")
	default:
		realtimeStreamEvents.WithLabelValues("invalid").Inc()
		apierror.Respond(w, r, http.StatusUnauthorized, "REALTIME_TOKEN_INVALID", "the status token is not valid")
	}
	return time.Time{}, false
}

// Status serves the snapshot (JSON) or the stream (text/event-stream).
func (h *RealtimeHandler) Status(w http.ResponseWriter, r *http.Request) {
	setRealtimeCORS(w)
	w.Header().Set("Cache-Control", "no-store")
	if h == nil || h.tokens == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "REALTIME_UNAVAILABLE", "realtime status is not available")
		return
	}
	sessionID := chi.URLParam(r, "id")
	exp, ok := h.authorize(w, r, sessionID)
	if !ok {
		return
	}
	if !strings.Contains(r.Header.Get("Accept"), realtimeStreamMediaType) {
		s, err := h.sessions.Get(r.Context(), sessionID)
		if err != nil || s == nil {
			apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment session not found")
			return
		}
		writeJSON(w, http.StatusOK, publicStatus(s, time.Now()))
		return
	}
	h.stream(w, r, sessionID, exp)
}

func (h *RealtimeHandler) admit(sessionID, ip string) (chan realtimeStatus, func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.perIP[ip] >= RealtimeMaxPerIP {
		return nil, nil, false
	}
	wch := h.watchers[sessionID]
	if wch != nil && len(wch.subs) >= RealtimeMaxPerSession {
		return nil, nil, false
	}
	if wch == nil {
		wch = &sessionWatcher{id: sessionID, subs: map[chan realtimeStatus]struct{}{}, stop: make(chan struct{})}
		h.watchers[sessionID] = wch
		go h.watch(wch)
	}
	ch := make(chan realtimeStatus, 4)
	wch.subs[ch] = struct{}{}
	h.perIP[ip]++
	realtimeActiveStreams.Inc()
	release := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(wch.subs, ch)
		if h.perIP[ip]--; h.perIP[ip] <= 0 {
			delete(h.perIP, ip)
		}
		if len(wch.subs) == 0 && h.watchers[sessionID] == wch {
			delete(h.watchers, sessionID)
			close(wch.stop)
		}
		realtimeActiveStreams.Dec()
	}
	return ch, release, true
}

type sessionWatcher struct {
	id   string
	subs map[chan realtimeStatus]struct{}
	last *realtimeStatus
	stop chan struct{}
}

// watch reads the canonical session once per poll interval while anyone is
// subscribed, and fans out a change.
func (h *RealtimeHandler) watch(w *sessionWatcher) {
	t := time.NewTicker(h.poll)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := h.sessions.Get(ctx, w.id)
		cancel()
		if err != nil || s == nil {
			continue // a failed read is not a status; the next tick tries again
		}
		st := publicStatus(s, time.Now())
		h.mu.Lock()
		changed := w.last == nil || w.last.Status != st.Status
		if changed {
			w.last = &st
			for ch := range w.subs {
				select {
				case ch <- st:
				default: // a slow client misses an intermediate state; it gets the next
				}
			}
		}
		h.mu.Unlock()
	}
}

func (h *RealtimeHandler) stream(w http.ResponseWriter, r *http.Request, sessionID string, exp time.Time) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		apierror.Respond(w, r, http.StatusNotAcceptable, "STREAMING_UNSUPPORTED", "streaming is not supported here")
		return
	}
	s, err := h.sessions.Get(r.Context(), sessionID)
	if err != nil || s == nil {
		apierror.Respond(w, r, http.StatusNotFound, "NOT_FOUND", "payment session not found")
		return
	}
	ip := clientip.LimiterKey(r.RemoteAddr)
	ch, release, ok := h.admit(sessionID, ip)
	if !ok {
		realtimeStreamEvents.WithLabelValues("rate_limited").Inc()
		w.Header().Set("Retry-After", strconv.Itoa(int(RealtimeHeartbeat.Seconds())))
		apierror.Respond(w, r, http.StatusTooManyRequests, "REALTIME_STREAM_LIMIT",
			fmt.Sprintf("at most %d streams per Payment Session and %d per client", RealtimeMaxPerSession, RealtimeMaxPerIP))
		return
	}
	defer release()

	// The server's WriteTimeout would end every stream at 15 s. This response
	// bounds itself (terminal status, token expiry, client close).
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	hdr := w.Header()
	hdr.Set("Content-Type", "text/event-stream; charset=utf-8")
	hdr.Set("Cache-Control", "no-cache, no-transform")
	hdr.Set("X-Accel-Buffering", "no") // nginx: do not buffer this response
	hdr.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	realtimeStreamEvents.WithLabelValues("opened").Inc()
	slog.InfoContext(r.Context(), "realtime.stream_opened", "session_id", sessionID)
	started := time.Now()
	seq := 0
	send := func(event string, st realtimeStatus) bool {
		seq++
		b, _ := json.Marshal(st)
		if _, err := fmt.Fprintf(w, "id: %s-%d\nevent: %s\ndata: %s\n\n", st.Status, seq, event, b); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	fmt.Fprint(w, "retry: 3000\n\n")
	current := publicStatus(s, time.Now())
	if !send("snapshot", current) {
		return
	}
	if current.Terminal {
		realtimeStreamEvents.WithLabelValues("terminal_close").Inc()
		return
	}
	beat := time.NewTicker(h.beat)
	defer beat.Stop()
	expire := time.NewTimer(time.Until(exp))
	defer expire.Stop()
	for {
		select {
		case <-r.Context().Done():
			realtimeStreamEvents.WithLabelValues("client_closed").Inc()
			slog.InfoContext(r.Context(), "realtime.stream_closed", "session_id", sessionID, "reason", "client", "seconds", int(time.Since(started).Seconds()))
			return
		case <-beat.C:
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-expire.C:
			seq++
			fmt.Fprintf(w, "id: expired-%d\nevent: expired\ndata: {\"session_id\":%q}\n\n", seq, sessionID)
			flusher.Flush()
			realtimeStreamEvents.WithLabelValues("token_expired_close").Inc()
			return
		case st := <-ch:
			if st.Status == current.Status {
				continue
			}
			current = st
			if !send("status", st) {
				return
			}
			if st.Terminal {
				realtimeStreamEvents.WithLabelValues("terminal_close").Inc()
				slog.InfoContext(r.Context(), "realtime.stream_closed", "session_id", sessionID, "reason", "terminal", "status", st.Status)
				return
			}
		}
	}
}
