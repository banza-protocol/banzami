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

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/banzami/banzami/services/common/clientip"
	"github.com/banzami/banzami/services/public-api/internal/apierror"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// Consumer wallet realtime (CONSUMER-HOME-REALTIME-001).
//
//	GET /v1/me/realtime
//	Authorization: Bearer <consumer session JWT>   (the same credential as the
//	                                                 rest of /v1/me — never a
//	                                                 developer/payment bzst_ token)
//	Accept: text/event-stream   → a stream
//	Accept: application/json    → one snapshot (the fallback read)
//
// This mirrors the proven payment-session realtime handler
// (services/api-gateway/internal/handler/realtime.go): it polls the canonical
// Core reads on an interval, dedups watchers so every stream for one consumer
// shares one poll, fans out a change, and caps streams per consumer and per IP.
//
// WHAT IT IS NOT
//
// Not a source of financial truth. Every value it sends is read from the
// canonical consumer wallet + activity feed (Core). A stream that fails changes
// nothing about the money; the client refetches canonical state on every event.
// It is a read-only notification channel — no write/mutation authority, and no
// POST/PUT/PATCH/DELETE exists in this namespace.
//
// CONSUMER ISOLATION
//
// A stream is scoped strictly to the authenticated consumer. The watcher key and
// every canonical read use that consumer's own id and wallet, so a consumer can
// never receive another consumer's balance or activity.
//
// SHAPE OF A STREAM
//
//	retry: 3000
//	event: snapshot        {available_minor, currency, activity_marker, at} — always first
//	event: wallet.changed  the same shape, whenever the change-token differs
//	: heartbeat            every ConsumerRealtimeHeartbeat, a comment, never an event
//	event: expired         the session lifetime ended; the stream closes
//
// A terminal close also happens on client disconnect (ctx.Done), freeing the
// watcher slot promptly.

const (
	// ConsumerRealtimePollInterval: how often the shared watcher reads the
	// canonical wallet + activity. Balance is far less latency-critical than a
	// payment status, so this is 2 s (not the payment stream's 1 s) — it keeps
	// Core load low while comfortably meeting the milestone's <3 s p95 target.
	ConsumerRealtimePollInterval = 2 * time.Second
	// ConsumerRealtimeHeartbeat bounds how long an abandoned stream (a reloaded
	// page behind a proxy) keeps its per-consumer place: the place is freed at
	// the first heartbeat whose write fails. Kept at 5 s for the same reason as
	// the payment stream (see realtime.go).
	ConsumerRealtimeHeartbeat = 5 * time.Second
	// ConsumerRealtimeMaxPerConsumer caps concurrent streams for one consumer
	// (a phone + the App Web tab + one spare).
	ConsumerRealtimeMaxPerConsumer = 3
	// ConsumerRealtimeMaxPerIP caps concurrent streams from one client address
	// (shared NAT / office network headroom).
	ConsumerRealtimeMaxPerIP = 20
	// ConsumerRealtimeMaxLifetime is the fallback close deadline when the token
	// carries no usable expiry: the stream never lives longer than this. The real
	// deadline is the JWT `exp` (Consumer.ExpiresAt); this only bounds the
	// pathological case, and is generous enough not to disturb a live session.
	ConsumerRealtimeMaxLifetime = 24 * time.Hour

	consumerRealtimeMediaType = "text/event-stream"
	consumerRealtimeCurrency  = "AOA"
)

var (
	consumerRealtimeActiveStreams = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "banzami_consumer_realtime_active_streams", Help: "Open consumer wallet realtime streams.",
	})
	consumerRealtimeStreamEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_consumer_realtime_stream_events_total", Help: "Consumer wallet realtime stream lifecycle outcomes.",
	}, []string{"outcome"})
	consumerRealtimePollFailures = promauto.NewCounter(prometheus.CounterOpts{
		Name: "banzami_consumer_realtime_poll_failures_total", Help: "Failed canonical reads while polling a consumer wallet.",
	})
)

// walletRealtimeReader is the slice of the Core client this handler needs.
// Satisfied by *service.CorePublicClient and by test fakes.
type walletRealtimeReader interface {
	GetWalletForConsumer(ctx context.Context, consumerID, currency string) (*service.ConsumerWalletRecord, error)
	GetWalletBalance(ctx context.Context, walletID string) (*service.ConsumerWalletBalance, error)
	GetActivity(ctx context.Context, consumerID string, limit int, cursor, typeFilter, directionFilter string) (*service.ActivityPage, error)
}

// walletSnapshot is what a stream sends: the consumer's own available balance,
// currency, a cheap latest-activity marker, and the observation time. No handle,
// name, wallet id, account id or counterparty appears here.
type walletSnapshot struct {
	AvailableMinor int64  `json:"available_minor"`
	Currency       string `json:"currency"`
	ActivityMarker string `json:"activity_marker"`
	At             string `json:"at"`
}

// changed reports whether the change-token differs: the available balance minor
// OR the latest-activity marker. `At` is not part of the token (it changes every
// read). The marker catches same-amount edges (e.g. a send-out then an equal
// receive would net to the same balance but a new activity id).
func (s walletSnapshot) changed(other walletSnapshot) bool {
	return s.AvailableMinor != other.AvailableMinor || s.ActivityMarker != other.ActivityMarker
}

// ConsumerRealtimeHandler serves the consumer wallet snapshot and stream.
type ConsumerRealtimeHandler struct {
	core    walletRealtimeReader
	poll    time.Duration
	beat    time.Duration
	maxLife time.Duration

	mu       sync.Mutex
	watchers map[string]*consumerWatcher
	perIP    map[string]int
}

// NewConsumerRealtimeHandler wires the handler for production use.
func NewConsumerRealtimeHandler(core *service.CorePublicClient) *ConsumerRealtimeHandler {
	return newConsumerRealtimeHandler(core)
}

// newConsumerRealtimeHandler builds against the interface, so tests can inject a
// fake reader.
func newConsumerRealtimeHandler(core walletRealtimeReader) *ConsumerRealtimeHandler {
	return &ConsumerRealtimeHandler{
		core:     core,
		poll:     ConsumerRealtimePollInterval,
		beat:     ConsumerRealtimeHeartbeat,
		maxLife:  ConsumerRealtimeMaxLifetime,
		watchers: map[string]*consumerWatcher{},
		perIP:    map[string]int{},
	}
}

// readSnapshot reads the consumer's own canonical wallet balance + latest
// activity marker. A consumer without a wallet yet is not an error: they read as
// zero available and an empty marker, and can still hold a stream.
func (h *ConsumerRealtimeHandler) readSnapshot(ctx context.Context, consumerID string) (walletSnapshot, error) {
	var available int64
	wallet, err := h.core.GetWalletForConsumer(ctx, consumerID, consumerRealtimeCurrency)
	switch {
	case err == nil:
		bal, berr := h.core.GetWalletBalance(ctx, wallet.ID)
		if berr != nil {
			return walletSnapshot{}, berr
		}
		available = bal.AvailableMinor
	case errors.Is(err, service.ErrConsumerWalletNotFound):
		available = 0
	default:
		return walletSnapshot{}, err
	}

	marker := ""
	page, err := h.core.GetActivity(ctx, consumerID, 1, "", "", "")
	if err != nil {
		return walletSnapshot{}, err
	}
	if page != nil && len(page.Items) > 0 {
		it := page.Items[0]
		marker = it.ActivityID
		if !it.CreatedAt.IsZero() {
			// id + timestamp: robust even if two events shared an id shape.
			marker = it.ActivityID + "|" + it.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
	}
	return walletSnapshot{
		AvailableMinor: available,
		Currency:       consumerRealtimeCurrency,
		ActivityMarker: marker,
		At:             time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// Realtime serves the snapshot (JSON) or the stream (text/event-stream), scoped
// to the authenticated consumer.
func (h *ConsumerRealtimeHandler) Realtime(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h == nil || h.core == nil {
		apierror.Respond(w, r, http.StatusServiceUnavailable, "REALTIME_UNAVAILABLE", "realtime is not available")
		return
	}
	consumer, ok := middleware.GetConsumer(r.Context())
	if !ok || consumer == nil {
		consumerRealtimeStreamEvents.WithLabelValues("unauthenticated").Inc()
		apierror.Respond(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	// Content negotiation: a plain read gets one snapshot; only an explicit
	// text/event-stream Accept opens a stream.
	if !strings.Contains(r.Header.Get("Accept"), consumerRealtimeMediaType) {
		snap, err := h.readSnapshot(r.Context(), consumer.ID)
		if err != nil {
			apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read wallet")
			return
		}
		respond(w, http.StatusOK, snap)
		return
	}
	h.stream(w, r, consumer.ID, h.deadline(consumer))
}

// deadline: the stream closes at the token's own expiry, never later than the
// bounded max lifetime.
func (h *ConsumerRealtimeHandler) deadline(c *middleware.Consumer) time.Time {
	max := time.Now().Add(h.maxLife)
	if c != nil && !c.ExpiresAt.IsZero() && c.ExpiresAt.Before(max) {
		return c.ExpiresAt
	}
	return max
}

// admit registers one subscriber, starting the per-consumer watcher on the
// first subscriber. It refuses past the per-IP or per-consumer cap.
func (h *ConsumerRealtimeHandler) admit(consumerID, ip string) (chan walletSnapshot, func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.perIP[ip] >= ConsumerRealtimeMaxPerIP {
		return nil, nil, false
	}
	wch := h.watchers[consumerID]
	if wch != nil && len(wch.subs) >= ConsumerRealtimeMaxPerConsumer {
		return nil, nil, false
	}
	if wch == nil {
		wch = &consumerWatcher{consumerID: consumerID, subs: map[chan walletSnapshot]struct{}{}, stop: make(chan struct{})}
		h.watchers[consumerID] = wch
		go h.watch(wch)
	}
	ch := make(chan walletSnapshot, 4)
	wch.subs[ch] = struct{}{}
	h.perIP[ip]++
	consumerRealtimeActiveStreams.Inc()
	release := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(wch.subs, ch)
		if h.perIP[ip]--; h.perIP[ip] <= 0 {
			delete(h.perIP, ip)
		}
		if len(wch.subs) == 0 && h.watchers[consumerID] == wch {
			delete(h.watchers, consumerID)
			close(wch.stop)
		}
		consumerRealtimeActiveStreams.Dec()
	}
	return ch, release, true
}

type consumerWatcher struct {
	consumerID string
	subs       map[chan walletSnapshot]struct{}
	last       *walletSnapshot
	stop       chan struct{}
}

// watch reads the canonical wallet + activity once per poll interval while
// anyone is subscribed, and fans out a change. Reads are scoped to this
// watcher's own consumerID — never another's.
func (h *ConsumerRealtimeHandler) watch(w *consumerWatcher) {
	t := time.NewTicker(h.poll)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		snap, err := h.readSnapshot(ctx, w.consumerID)
		cancel()
		if err != nil {
			consumerRealtimePollFailures.Inc() // a failed read is not a change; the next tick tries again
			continue
		}
		h.mu.Lock()
		if w.last == nil || w.last.changed(snap) {
			w.last = &snap
			for ch := range w.subs {
				select {
				case ch <- snap:
				default: // a slow client misses an intermediate state; it gets the next
				}
			}
		}
		h.mu.Unlock()
	}
}

func (h *ConsumerRealtimeHandler) stream(w http.ResponseWriter, r *http.Request, consumerID string, deadline time.Time) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		consumerRealtimeStreamEvents.WithLabelValues("streaming_unsupported").Inc()
		apierror.Respond(w, r, http.StatusNotAcceptable, "STREAMING_UNSUPPORTED", "streaming is not supported here")
		return
	}
	// Read the first snapshot before taking a slot: a broken read fails the
	// request instead of holding one of the consumer's places.
	first, err := h.readSnapshot(r.Context(), consumerID)
	if err != nil {
		consumerRealtimeStreamEvents.WithLabelValues("snapshot_read_error").Inc()
		apierror.Respond(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "could not read wallet")
		return
	}
	ip := clientip.LimiterKey(r.RemoteAddr)
	ch, release, ok := h.admit(consumerID, ip)
	if !ok {
		consumerRealtimeStreamEvents.WithLabelValues("rate_limited").Inc()
		w.Header().Set("Retry-After", strconv.Itoa(int(ConsumerRealtimeHeartbeat.Seconds())))
		apierror.Respond(w, r, http.StatusTooManyRequests, "REALTIME_STREAM_LIMIT",
			fmt.Sprintf("at most %d streams per consumer and %d per client", ConsumerRealtimeMaxPerConsumer, ConsumerRealtimeMaxPerIP))
		return
	}
	defer release()

	// The server's WriteTimeout would end every stream early. This response
	// bounds itself (token expiry, client close).
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	hdr := w.Header()
	hdr.Set("Content-Type", "text/event-stream; charset=utf-8")
	hdr.Set("Cache-Control", "no-cache, no-transform")
	hdr.Set("X-Accel-Buffering", "no") // nginx: do not buffer this response
	hdr.Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	consumerRealtimeStreamEvents.WithLabelValues("opened").Inc()
	slog.InfoContext(r.Context(), "consumer_realtime.stream_opened", "consumer_id", consumerID)
	started := time.Now()
	seq := 0
	send := func(event string, s walletSnapshot) bool {
		seq++
		b, _ := json.Marshal(s)
		if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", seq, event, b); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	fmt.Fprint(w, "retry: 3000\n\n")
	current := first
	if !send("snapshot", current) {
		return
	}

	beat := time.NewTicker(h.beat)
	defer beat.Stop()
	expire := time.NewTimer(time.Until(deadline))
	defer expire.Stop()
	for {
		select {
		case <-r.Context().Done():
			consumerRealtimeStreamEvents.WithLabelValues("client_closed").Inc()
			slog.InfoContext(r.Context(), "consumer_realtime.stream_closed", "consumer_id", consumerID, "reason", "client", "seconds", int(time.Since(started).Seconds()))
			return
		case <-beat.C:
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-expire.C:
			seq++
			fmt.Fprintf(w, "id: %d\nevent: expired\ndata: {}\n\n", seq)
			flusher.Flush()
			consumerRealtimeStreamEvents.WithLabelValues("expired_close").Inc()
			slog.InfoContext(r.Context(), "consumer_realtime.stream_closed", "consumer_id", consumerID, "reason", "expired", "seconds", int(time.Since(started).Seconds()))
			return
		case snap := <-ch:
			if !current.changed(snap) {
				continue
			}
			current = snap
			if !send("wallet.changed", snap) {
				return
			}
		}
	}
}
