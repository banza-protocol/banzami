package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// probeTimeout bounds every dependency probe. Readiness must answer quickly even
// when a dependency is hanging: a readiness endpoint that blocks is itself an
// outage, because orchestrators and health checks read it on a timer.
const probeTimeout = 2 * time.Second

// buildCommit is the source revision this binary was built from, injected at
// image build time (ARG BUILD_COMMIT → ENV BANZAMI_BUILD_COMMIT) by the sandbox
// deploy pipeline, which already carries the commit end to end.
//
// It exists because "the container is healthy" never meant "the container is
// running the code we are assuring". Stage E found the deployed Sandbox running
// images built 105 commits behind main, and nothing served by the stack could
// have revealed that — the only evidence was an image tag readable over SSH.
// Reported here so an assurance run over the public surface can compare what is
// deployed against what was intended.
//
// Never a secret: a commit SHA of a private repository discloses nothing usable.
func buildCommit() string {
	if v := os.Getenv("BANZAMI_BUILD_COMMIT"); v != "" {
		return v
	}
	return "unknown"
}

// Liveness handles GET /health.
// Returns 200 as long as the process is running.
// No dependency checks — a failing dependency should not cause liveness to fail.
func Liveness(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"build":     buildCommit(),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// Readiness returns a HandlerFunc for GET /readyz.
//
// It returns 200 only when every critical dependency answered a real probe, and
// 503 otherwise. That wording used to be aspirational: the checks were
// `checkStub(cfg.DatabaseURL != "")` — true whenever a configuration STRING was
// non-empty, never a connection — under a doc comment already claiming
// reachability, beside a TODO admitting the gap.
//
// The cost was not theoretical. Every Stage C/D assurance report cited
// `"database":"ok"` from this endpoint as evidence the Sandbox was healthy, and
// that evidence was vacuous the entire time: the answer could not have been
// anything else while the variable was set. Recorded as SE-003.
//
// Both probes now fail closed. A nil client means the dependency was never wired,
// which is not a passing state — it is the same "we cannot tell" that the stub
// silently reported as "ok".
func Readiness(cfg *config.Config, db *pgxpool.Pool, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), probeTimeout)
		defer cancel()

		checks := map[string]string{
			"database": probeDatabase(ctx, cfg, db),
			"redis":    probeRedis(ctx, cfg, rdb),
		}

		status := http.StatusOK
		overall := "ok"
		for _, v := range checks {
			if v != "ok" {
				status = http.StatusServiceUnavailable
				overall = "degraded"
				break
			}
		}

		respond(w, status, map[string]any{
			"status":      overall,
			"environment": cfg.Environment,
			"build":       buildCommit(),
			"checks":      checks,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// probeDatabase opens a real round trip to PostgreSQL. The error itself is never
// surfaced: a DSN, host or credential can appear in a driver error, and this
// endpoint is reachable from the Internet.
func probeDatabase(ctx context.Context, cfg *config.Config, db *pgxpool.Pool) string {
	if cfg.DatabaseURL == "" {
		return "not_configured"
	}
	if db == nil {
		return "not_configured"
	}
	if err := db.Ping(ctx); err != nil {
		return "unreachable"
	}
	return "ok"
}

// probeRedis mirrors probeDatabase for the cache/coordination dependency, which
// carries idempotency keys and rate limits — a gateway that cannot reach it is
// not ready to take payment traffic.
func probeRedis(ctx context.Context, cfg *config.Config, rdb *redis.Client) string {
	if cfg.RedisURL == "" {
		return "not_configured"
	}
	if rdb == nil {
		return "not_configured"
	}
	if err := rdb.Ping(ctx).Err(); err != nil {
		return "unreachable"
	}
	return "ok"
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
