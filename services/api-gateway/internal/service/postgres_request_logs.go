package service

// Persistence for the Developer API request log (migration 0104).
//
// Writes are asynchronous and bounded. The gateway's synchronous path is the
// payment path — ledger posting, wallet update, response — and a telemetry
// insert has no business being inside it. Entries go to a buffered channel and
// a single worker flushes them in batches.
//
// Under sustained overload the buffer fills. The choice then is to block the
// API on its own logging or to drop log lines, and dropping is the only honest
// one: a request log is diagnostic, not financial. Drops are counted and warned
// about rather than hidden, so a full buffer is visible as a defect and not as
// a quietly incomplete screen.

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// APIRequestLogEntry is the complete set of fields that may be persisted for one
// Developer API request. There is deliberately no map, no body and no header
// field: a schema with nowhere to put a secret cannot leak one by a later edit.
//
// It lives in this package rather than next to the middleware that produces it
// because the middleware already depends on service (developer-key auth), and
// the reverse edge would be an import cycle.
type APIRequestLogEntry struct {
	ProjectID   string
	KeyID       string
	Environment string
	Method      string
	Path        string
	Route       string
	Status      int
	RequestID   string
	LatencyMS   int
	At          time.Time
}

// APIRequestLogSink accepts finished entries. Implementations MUST NOT block.
type APIRequestLogSink interface {
	Record(APIRequestLogEntry)
}

const (
	requestLogBuffer    = 4096
	requestLogBatch     = 200
	requestLogFlushTick = 300 * time.Millisecond

	// Sandbox retention. Long enough to debug an integration across a weekend,
	// short enough that the table does not grow without bound. Diagnostic data
	// only — audit records live in developer.audit_events and are governed by
	// their own (immutable, non-pruned) policy.
	RequestLogRetention = 30 * 24 * time.Hour

	requestLogPruneEvery = time.Hour
	// One pruning statement deletes at most this many rows, so a long-neglected
	// table is drained over several passes instead of in one lock-heavy delete.
	requestLogPruneBatch = 20000
)

// PostgresRequestLogRecorder implements middleware.APIRequestLogSink.
type PostgresRequestLogRecorder struct {
	pool    *pgxpool.Pool
	ch      chan APIRequestLogEntry
	dropped atomic.Uint64
	written atomic.Uint64
}

func NewPostgresRequestLogRecorder(pool *pgxpool.Pool) *PostgresRequestLogRecorder {
	return &PostgresRequestLogRecorder{
		pool: pool,
		ch:   make(chan APIRequestLogEntry, requestLogBuffer),
	}
}

// Record never blocks.
func (r *PostgresRequestLogRecorder) Record(e APIRequestLogEntry) {
	select {
	case r.ch <- e:
	default:
		if n := r.dropped.Add(1); n == 1 || n%100 == 0 {
			slog.Warn("developer request log buffer full — entries dropped", "dropped_total", n)
		}
	}
}

// Dropped and Written expose the counters for tests and diagnostics.
func (r *PostgresRequestLogRecorder) Dropped() uint64 { return r.dropped.Load() }
func (r *PostgresRequestLogRecorder) Written() uint64 { return r.written.Load() }

// StartWorker runs the flush loop and the retention pruner until ctx is done.
func (r *PostgresRequestLogRecorder) StartWorker(ctx context.Context) {
	go r.flushLoop(ctx)
	go r.pruneLoop(ctx)
}

func (r *PostgresRequestLogRecorder) flushLoop(ctx context.Context) {
	tick := time.NewTicker(requestLogFlushTick)
	defer tick.Stop()
	batch := make([]APIRequestLogEntry, 0, requestLogBatch)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		r.insert(ctx, batch)
		batch = batch[:0]
	}
	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case e := <-r.ch:
			batch = append(batch, e)
			if len(batch) >= requestLogBatch {
				flush()
			}
		case <-tick.C:
			flush()
		}
	}
}

func (r *PostgresRequestLogRecorder) insert(ctx context.Context, batch []APIRequestLogEntry) {
	// A cancelled request context must not abort the write of an entry that was
	// already accepted, so the insert gets its own bounded context.
	wctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()

	rows := make([][]any, 0, len(batch))
	for _, e := range batch {
		var keyID any
		if e.KeyID != "" {
			keyID = e.KeyID
		}
		var latency any
		if e.LatencyMS >= 0 {
			latency = e.LatencyMS
		}
		rows = append(rows, []any{
			e.ProjectID, keyID, e.Environment, e.Method, e.Path,
			e.Route, e.Status, e.RequestID, latency, e.At,
		})
	}
	n, err := r.pool.CopyFrom(wctx,
		pgx.Identifier{"developer", "dev_api_request_logs"},
		[]string{"project_id", "key_id", "environment", "method", "path",
			"route", "status", "request_id", "latency_ms", "created_at"},
		pgx.CopyFromRows(rows))
	if err != nil {
		// Losing telemetry is not worth a retry queue; it is worth being loud.
		slog.Error("developer request log insert failed", "error", err, "entries", len(batch))
		return
	}
	r.written.Add(uint64(n))
}

func (r *PostgresRequestLogRecorder) pruneLoop(ctx context.Context) {
	tick := time.NewTicker(requestLogPruneEvery)
	defer tick.Stop()
	r.Prune(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			r.Prune(ctx)
		}
	}
}

// Prune deletes request logs past the retention window. Exported so a test can
// prove the policy actually removes rows rather than trusting the ticker.
func (r *PostgresRequestLogRecorder) Prune(ctx context.Context) int64 {
	pctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	var total int64
	for {
		tag, err := r.pool.Exec(pctx,
			`DELETE FROM developer.dev_api_request_logs
			  WHERE id IN (
			      SELECT id FROM developer.dev_api_request_logs
			       WHERE created_at < now() - $1::interval
			       LIMIT $2
			  )`, RequestLogRetention.String(), requestLogPruneBatch)
		if err != nil {
			slog.Error("developer request log prune failed", "error", err)
			return total
		}
		n := tag.RowsAffected()
		total += n
		if n < requestLogPruneBatch {
			break
		}
	}
	if total > 0 {
		slog.Info("developer request logs pruned", "rows", total, "retention", RequestLogRetention.String())
	}
	return total
}
