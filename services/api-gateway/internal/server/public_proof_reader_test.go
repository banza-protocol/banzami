package server

// A9-08: banzami.com/r/{ref} is rendered on the website's server, so every
// reader's lookup reaches the gateway from the website's one address. Keyed on
// that address, one client making ~70 requests a minute made verification
// unavailable to everybody. The website now names the reader in
// config.ProofReaderHeader, and the gateway believes it only from the website.
//
// Driven through the production route (mountPublicProofVerify) behind the edge
// resolver, with a LEGACY reference: its own per-client ceiling (6/min, counted
// in-process when Redis cannot answer) is the one that decides here. The
// database refuses every connection, so an allowed lookup is a 500 and a
// limited one is a 429.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/clientip"
)

const websiteEgress = "217.160.9.248"

func proofRouteBehindEdge(t *testing.T, readers *clientip.Resolver) http.Handler {
	t.Helper()
	// A pool that refuses every connection and a Redis that cannot answer, as in
	// public_proof_route_test.go: the generic limiter fails open, the legacy
	// limiter counts in-process, and an allowed lookup ends as a 500.
	cfg, err := pgxpool.ParseConfig("postgres://probe@127.0.0.1:1/probe")
	if err != nil {
		t.Fatal(err)
	}
	cfg.MinConns = 0
	cfg.BeforeConnect = func(context.Context, *pgx.ConnConfig) error { return errors.New("no database in this test") }
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", MaxRetries: -1, DialerRetries: 1, DialerRetryTimeout: time.Millisecond})
	t.Cleanup(func() { _ = rdb.Close() })
	svc := service.NewProofService(pool, "k", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")

	r := chi.NewRouter()
	r.Use(clientip.New(clientip.HeaderRealIP, []netip.Prefix{netip.MustParsePrefix(edgeAddr + "/32")}).Middleware)
	mountPublicProofVerify(r, rdb, svc, "salt", readers)
	return r
}

// lookup arrives through the edge: X-Real-IP is who the edge saw (the website,
// or a browser calling the API directly); reader is what the website forwards.
func lookup(h http.Handler, edgeSaw, reader string) int {
	req := httptest.NewRequest(http.MethodGet, "/v1/public/proofs/BZM-5EED-0A11", nil)
	req.RemoteAddr = edgeAddr + ":40000"
	req.Header.Set("X-Real-IP", edgeSaw)
	if reader != "" {
		req.Header.Set(config.ProofReaderHeader, reader)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Code
}

func websiteReaders() *clientip.Resolver {
	return clientip.New(config.ProofReaderHeader, []netip.Prefix{netip.MustParsePrefix(websiteEgress + "/32")})
}

func TestProofReader_OneReaderCannotExhaustEveryone(t *testing.T) {
	h := proofRouteBehindEdge(t, websiteReaders())
	for i := 1; i <= middleware.LegacyProofPerIPPerMinute; i++ {
		if code := lookup(h, websiteEgress, "198.51.100.66"); code == http.StatusTooManyRequests {
			t.Fatalf("reader A limited at request %d", i)
		}
	}
	if code := lookup(h, websiteEgress, "198.51.100.66"); code != http.StatusTooManyRequests {
		t.Fatalf("reader A over its limit got %d, want 429", code)
	}
	if code := lookup(h, websiteEgress, "198.51.100.67"); code == http.StatusTooManyRequests {
		t.Fatal("reader B was refused because reader A used the website's allowance")
	}
}

// The header is the website's to send. From anyone else it is ignored, so a
// caller cannot buy a fresh allowance per request by rotating it.
func TestProofReader_HeaderIgnoredFromAnyoneButTheWebsite(t *testing.T) {
	h := proofRouteBehindEdge(t, websiteReaders())
	for i := 1; i <= middleware.LegacyProofPerIPPerMinute+1; i++ {
		code := lookup(h, "203.0.113.50", fmt.Sprintf("198.51.100.%d", i))
		if i == middleware.LegacyProofPerIPPerMinute+1 && code != http.StatusTooManyRequests {
			t.Fatalf("a direct caller rotating %s got %d on request %d, want 429", config.ProofReaderHeader, code, i)
		}
	}
}

// Unconfigured — the default — nobody is believed: the website's readers share
// its allowance (the old behaviour), and nothing is spoofable.
func TestProofReader_UnconfiguredBelievesNobody(t *testing.T) {
	h := proofRouteBehindEdge(t, nil)
	for i := 1; i <= middleware.LegacyProofPerIPPerMinute; i++ {
		lookup(h, websiteEgress, fmt.Sprintf("198.51.100.%d", i))
	}
	if code := lookup(h, websiteEgress, "198.51.100.200"); code != http.StatusTooManyRequests {
		t.Fatalf("with no forwarder configured a forwarded reader was believed (%d)", code)
	}
}
