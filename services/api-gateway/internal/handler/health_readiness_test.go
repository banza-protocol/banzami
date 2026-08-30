package handler_test

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// These tests exist because the previous readiness implementation could not fail.
// It reported `"database":"ok"` whenever DATABASE_URL was a non-empty string, so
// every assertion about it was true by construction — and Stage C/D assurance
// reports cited that value as evidence the Sandbox was healthy (finding SE-003).
//
// The point of each case below is therefore the NEGATIVE: readiness must be able
// to say no. A suite that only proves the happy path would reproduce exactly the
// vacuity it is meant to close.

func readyz(t *testing.T, cfg *config.Config, db *pgxpool.Pool, rdb *redis.Client) (int, map[string]any) {
	t.Helper()
	w := httptest.NewRecorder()
	handler.Readiness(cfg, db, rdb)(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode readyz body: %v", err)
	}
	return w.Code, body
}

func checksOf(t *testing.T, body map[string]any) map[string]any {
	t.Helper()
	c, ok := body["checks"].(map[string]any)
	if !ok {
		t.Fatalf("readyz body has no checks object: %v", body)
	}
	return c
}

// A DSN that is configured but points nowhere must NOT be reported ready. This is
// the exact case the old stub got wrong: the string was set, so it said "ok".
func TestReadiness_ConfiguredButUnreachableDB_Is503(t *testing.T) {
	cfg := &config.Config{Environment: "sandbox", DatabaseURL: "postgres://nobody@127.0.0.1:1/none"}
	// Port 1 is reserved and never listening; pgxpool.New does not dial, so the
	// failure surfaces on Ping — which is precisely what must be exercised.
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("pool construct: %v", err)
	}
	defer pool.Close()

	code, body := readyz(t, cfg, pool, nil)
	if code != http.StatusServiceUnavailable {
		t.Fatalf("configured-but-unreachable DB must be 503, got %d (%v)", code, body)
	}
	if got := checksOf(t, body)["database"]; got != "unreachable" {
		t.Errorf(`database check = %v, want "unreachable"`, got)
	}
	if body["status"] != "degraded" {
		t.Errorf("status = %v, want degraded", body["status"])
	}
}

// No DSN at all is also not ready. "We were never wired to a database" is not a
// passing state, and reporting it as one is how the original defect read.
func TestReadiness_UnconfiguredDB_Is503(t *testing.T) {
	cfg := &config.Config{Environment: "sandbox"}
	code, body := readyz(t, cfg, nil, nil)
	if code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured DB must be 503, got %d", code)
	}
	if got := checksOf(t, body)["database"]; got != "not_configured" {
		t.Errorf(`database check = %v, want "not_configured"`, got)
	}
}

// A DSN set while the pool was never constructed must not pass either — this is
// the shape a partially-initialised service has, and the stub could not see it.
func TestReadiness_ConfiguredDSNButNilPool_Is503(t *testing.T) {
	cfg := &config.Config{Environment: "sandbox", DatabaseURL: "postgres://looks-real/db"}
	code, body := readyz(t, cfg, nil, nil)
	if code != http.StatusServiceUnavailable {
		t.Fatalf("nil pool must be 503, got %d", code)
	}
	if got := checksOf(t, body)["database"]; got != "not_configured" {
		t.Errorf(`database check = %v, want "not_configured"`, got)
	}
}

// Redis is claimed by this endpoint, so it must be probed for real too — the
// original stub was wrong about both dependencies, not just the database.
func TestReadiness_ConfiguredButUnreachableRedis_Is503(t *testing.T) {
	cfg := &config.Config{Environment: "sandbox", RedisURL: "redis://127.0.0.1:1/0"}
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	defer rdb.Close()

	code, body := readyz(t, cfg, nil, rdb)
	if code != http.StatusServiceUnavailable {
		t.Fatalf("unreachable redis must be 503, got %d", code)
	}
	if got := checksOf(t, body)["redis"]; got != "unreachable" {
		t.Errorf(`redis check = %v, want "unreachable"`, got)
	}
}

// A hanging dependency must not hang readiness. An endpoint an orchestrator polls
// has to answer; blocking on a wedged dependency turns a degraded service into an
// unresponsive one. Uses a real listener that accepts and never speaks, so the
// bound comes from the probe timeout rather than from a sleep.
func TestReadiness_HangingDependency_StillAnswersBounded(t *testing.T) {
	ln := mustListen(t)
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c // accepted, never spoken to
		}
	}()

	cfg := &config.Config{Environment: "sandbox", RedisURL: "redis://" + ln.Addr().String()}
	rdb := redis.NewClient(&redis.Options{Addr: ln.Addr().String()})
	defer rdb.Close()

	start := time.Now()
	code, _ := readyz(t, cfg, nil, rdb)
	elapsed := time.Since(start)

	if code != http.StatusServiceUnavailable {
		t.Fatalf("hanging dependency must be 503, got %d", code)
	}
	if elapsed > 10*time.Second {
		t.Fatalf("readiness took %v — probe is not bounded", elapsed)
	}
}

// Build identity must be reported so an assurance run can tell WHICH build
// answered. Stage E found the Sandbox running images 105 commits behind main
// with nothing served by the stack able to reveal it.
func TestReadiness_ReportsBuildIdentity(t *testing.T) {
	t.Setenv("BANZAMI_BUILD_COMMIT", "deadbeefcafe")
	cfg := &config.Config{Environment: "sandbox"}
	_, body := readyz(t, cfg, nil, nil)
	if body["build"] != "deadbeefcafe" {
		t.Errorf("build = %v, want deadbeefcafe", body["build"])
	}
}

func TestReadiness_UnknownBuildWhenUnset(t *testing.T) {
	os.Unsetenv("BANZAMI_BUILD_COMMIT")
	cfg := &config.Config{Environment: "sandbox"}
	_, body := readyz(t, cfg, nil, nil)
	if body["build"] != "unknown" {
		t.Errorf(`build = %v, want "unknown" — never blank, so a missing identity is visible`, body["build"])
	}
}

// The positive leg, against a REAL PostgreSQL when one is provided. Without it
// the suite could only prove readiness can fail, which is only half the contract.
func TestReadiness_RealPostgres_IsReady(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — real-database readiness leg skipped")
	}
	cfg := &config.Config{Environment: "sandbox", DatabaseURL: dsn}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	code, body := readyz(t, cfg, pool, nil)
	if got := checksOf(t, body)["database"]; got != "ok" {
		t.Fatalf(`database check = %v, want "ok" (code %d)`, got, code)
	}
}

func mustListen(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	return ln
}
