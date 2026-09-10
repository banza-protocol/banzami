package handler

// GET /admin/v1/attention-summary?environment=LIVE|SANDBOX
//
// What in BANZADMIN is waiting for this operator, per sidebar category — the
// one source of every sidebar badge and the bell. The rules live in the
// gateway (api-gateway service/attention.go) and, for the Inbox, in the
// compliance cases; this handler only assembles them, keeps the categories the
// operator's role may open, and caches the result briefly.
//
// Counts only. No ids, names, handles or amounts, and no category the caller
// cannot open: a count of a queue you may not see is itself information.
// docs/admin/OPERATOR_ATTENTION.md describes each category.

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// AttentionCategories: sidebar category → the capability that opens its page.
// A category absent here is never returned (deny by default).
var AttentionCategories = map[string]auth.Capability{
	"inbox":                   auth.CapApplicationView, // GET /admin/v1/compliance/cases
	"business_applications":   auth.CapApplicationView, // GET /admin/v1/merchant-applications
	"kyb_documents":           auth.CapApplicationView, // GET /admin/v1/merchant-kyb/merchants
	"kyc_documents":           auth.CapConsumerView,    // GET /admin/v1/kyc/cases
	"settlements":             auth.CapSettlementView,  // GET /admin/v1/settlements/all
	"payouts":                 auth.CapPayoutView,      // GET /admin/v1/payouts/all
	"reconciliation":          auth.CapRiskView,        // GET /admin/v1/risk/acquiring-recon
	"disputes":                auth.CapDisputeView,     // GET /admin/v1/disputes
	"risk_flags":              auth.CapRiskView,        // GET /admin/v1/risk/flags
	"application_settlements": auth.CapFinanceView,     // GET /admin/v1/application-settlements
}

// attentionAggregate: the Inbox gathers cases from other queues (applications,
// KYB, KYC, failed settlements), so it is left out of the total — counting it
// would count the same work twice.
const attentionAggregate = "inbox"

// attentionTTL bounds how stale a badge can be between mutations. Any successful
// mutation through admin-api drops the cache (InvalidateAttention), so an
// operator's own action shows at once; the TTL only covers work arriving from
// elsewhere (a new application, an upload in the Business App).
const attentionTTL = 10 * time.Second

var (
	attentionRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzadmin_attention_requests_total",
		Help: "Attention summary requests by outcome (ok|unavailable|upstream_error|environment_mismatch) and cache (hit|miss).",
	}, []string{"outcome", "cache"})
	attentionLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "banzadmin_attention_compute_seconds",
		Help:    "Time to compute an attention summary on a cache miss (gateway + inbox + bell).",
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
	})
	attentionItems = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "banzadmin_attention_items",
		Help: "Items waiting for an operator, per category and environment (last computed).",
	}, []string{"environment", "category"})
)

type attentionGateway interface {
	AttentionSummaryRaw(ctx context.Context) (json.RawMessage, int, error)
}

type openCaseCounter interface {
	Sync(ctx context.Context) error
	OpenCount(ctx context.Context) (int, error)
}

type unreadCounter interface {
	Generate(ctx context.Context) error
	UnreadCount(ctx context.Context) (int, error)
}

// AttentionSource is everything one environment needs. Gateway is required;
// Compliance (the Inbox) and Notifications (the bell) are optional. Pass true
// nil interfaces, not typed nils.
type AttentionSource struct {
	Gateway       attentionGateway
	Compliance    openCaseCounter
	Notifications unreadCounter
}

type attentionCount struct {
	Count  int      `json:"count"`
	States []string `json:"states,omitempty"`
}

type attentionComputed struct {
	environment string
	generatedAt time.Time
	categories  map[string]attentionCount
	unread      *int // nil when the bell count is unavailable
}

type attentionEntry struct {
	value attentionComputed
	at    time.Time
	gen   uint64
}

type AttentionHandler struct {
	sources map[string]AttentionSource // "LIVE" | "SANDBOX"

	mu    sync.Mutex
	gen   uint64
	cache map[string]attentionEntry
	calls map[string]*attentionCall // one computation per environment at a time
	now   func() time.Time
}

type attentionCall struct {
	done  chan struct{}
	value attentionComputed
	err   error
}

// NewAttentionHandler: sources by environment ("LIVE", "SANDBOX"). An
// environment without a source answers 503.
func NewAttentionHandler(sources map[string]AttentionSource) *AttentionHandler {
	h := &AttentionHandler{
		sources: map[string]AttentionSource{},
		cache:   map[string]attentionEntry{},
		calls:   map[string]*attentionCall{},
		now:     time.Now,
	}
	for env, src := range sources {
		if src.Gateway != nil {
			h.sources[env] = src
		}
	}
	return h
}

// InvalidateAttention drops every cached summary. Called after any successful
// mutation (see server.go), so the badge follows the operator's own action.
func (h *AttentionHandler) InvalidateAttention() {
	h.mu.Lock()
	h.gen++
	h.cache = map[string]attentionEntry{}
	h.mu.Unlock()
}

func (h *AttentionHandler) Summary(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "operator session required")
		return
	}
	env := "LIVE"
	if r.URL.Query().Get("environment") == "SANDBOX" {
		env = "SANDBOX"
	}
	src, ok := h.sources[env]
	if !ok {
		attentionRequests.WithLabelValues("unavailable", "miss").Inc()
		writeError(w, http.StatusServiceUnavailable, "UNAVAILABLE", "attention summary is not configured for this environment")
		return
	}

	value, hit, err := h.get(r.Context(), env, src)
	cacheLabel := "miss"
	if hit {
		cacheLabel = "hit"
	}
	if err != nil {
		outcome := "upstream_error"
		if err == errAttentionEnvMismatch {
			outcome = "environment_mismatch"
		}
		attentionRequests.WithLabelValues(outcome, cacheLabel).Inc()
		slog.ErrorContext(r.Context(), "attention.summary.failed", "environment", env, "outcome", outcome, "error", err)
		// Never a partial or zeroed summary: the console hides its badges.
		writeError(w, http.StatusBadGateway, "ATTENTION_UNAVAILABLE", "could not compute the attention summary")
		return
	}
	attentionRequests.WithLabelValues("ok", cacheLabel).Inc()
	writeJSON(w, http.StatusOK, visibleAttention(value, p.Role))
}

// visibleAttention keeps the categories the role may open and totals them.
func visibleAttention(v attentionComputed, role string) map[string]any {
	cats := map[string]attentionCount{}
	total := 0
	for key, c := range v.categories {
		capability, known := AttentionCategories[key]
		if !known || !auth.Can(role, capability) {
			continue
		}
		cats[key] = c
		if key != attentionAggregate {
			total += c.Count
		}
	}
	out := map[string]any{
		"environment":  v.environment,
		"generated_at": v.generatedAt,
		"total":        total,
		"categories":   cats,
	}
	if v.unread != nil {
		out["unread_notifications"] = *v.unread
	}
	return out
}

var errAttentionEnvMismatch = &attentionError{"the gateway answered for another environment"}

type attentionError struct{ msg string }

func (e *attentionError) Error() string { return e.msg }

// get serves from the cache when fresh, otherwise computes once per
// environment however many operators ask at the same moment.
func (h *AttentionHandler) get(ctx context.Context, env string, src AttentionSource) (attentionComputed, bool, error) {
	h.mu.Lock()
	if e, ok := h.cache[env]; ok && e.gen == h.gen && h.now().Sub(e.at) < attentionTTL {
		h.mu.Unlock()
		return e.value, true, nil
	}
	if c, ok := h.calls[env]; ok {
		h.mu.Unlock()
		select {
		case <-c.done:
			return c.value, false, c.err
		case <-ctx.Done():
			return attentionComputed{}, false, ctx.Err()
		}
	}
	c := &attentionCall{done: make(chan struct{})}
	h.calls[env] = c
	gen := h.gen
	h.mu.Unlock()

	// Detached from the caller: a client that goes away must not fail the
	// computation the other waiters share.
	cctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 8*time.Second)
	start := time.Now()
	c.value, c.err = compute(cctx, env, src)
	cancel()
	attentionLatency.Observe(time.Since(start).Seconds())

	h.mu.Lock()
	delete(h.calls, env)
	if c.err == nil && gen == h.gen {
		h.cache[env] = attentionEntry{value: c.value, at: h.now(), gen: gen}
	}
	h.mu.Unlock()
	close(c.done)
	return c.value, false, c.err
}

func compute(ctx context.Context, env string, src AttentionSource) (attentionComputed, error) {
	raw, code, err := src.Gateway.AttentionSummaryRaw(ctx)
	if err != nil {
		return attentionComputed{}, err
	}
	if code != http.StatusOK {
		return attentionComputed{}, &attentionError{"gateway answered " + http.StatusText(validStatus(code))}
	}
	var gw struct {
		Environment string                    `json:"environment"`
		GeneratedAt time.Time                 `json:"generated_at"`
		Categories  map[string]attentionCount `json:"categories"`
	}
	if err := json.Unmarshal(raw, &gw); err != nil || gw.Categories == nil {
		return attentionComputed{}, &attentionError{"gateway summary unreadable"}
	}
	// The console asked for one environment's queues; a gateway answering for the
	// other (a misrouted client) must not be shown as this one's.
	if gw.Environment != env {
		return attentionComputed{}, errAttentionEnvMismatch
	}
	out := attentionComputed{environment: env, generatedAt: gw.GeneratedAt, categories: map[string]attentionCount{}}
	for key, c := range gw.Categories {
		if _, known := AttentionCategories[key]; known && key != attentionAggregate {
			out.categories[key] = c
		}
	}

	// Inbox: the compliance cases, refreshed from their sources first. Without a
	// fresh sync the count would be the last-known one, so a failed sync fails the
	// Inbox category (left out) rather than showing a stale number as current.
	if src.Compliance != nil {
		if err := src.Compliance.Sync(ctx); err != nil {
			slog.WarnContext(ctx, "attention.inbox.sync_failed", "environment", env, "error", err)
		} else if n, err := src.Compliance.OpenCount(ctx); err == nil {
			out.categories[attentionAggregate] = attentionCount{Count: n, States: []string{service.CaseStatusOpen}}
		}
	}
	// Bell: unread operator notifications. Best-effort, never fails the badges.
	if src.Notifications != nil {
		_ = src.Notifications.Generate(ctx)
		if n, err := src.Notifications.UnreadCount(ctx); err == nil {
			out.unread = &n
		}
	}
	for key, c := range out.categories {
		attentionItems.WithLabelValues(env, key).Set(float64(c.Count))
	}
	return out, nil
}
