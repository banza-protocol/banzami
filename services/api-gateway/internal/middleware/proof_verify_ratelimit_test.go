// The legacy proof throttle, proven against a real Redis.
//
// Skipped when REDIS_ADDR is unset. The properties that matter are not "a limit
// exists" but: the two buckets compose, a legacy flood cannot starve SECURE_V1,
// and the 429 says nothing about whether the reference was real.
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

func redisForTest(t *testing.T) *redis.Client {
	t.Helper()
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		t.Skip("REDIS_ADDR not set — skipping Redis-backed limiter tests")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Skipf("redis unreachable: %v", err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

// clearBuckets removes this test's keys so runs do not inherit each other.
func clearBuckets(t *testing.T, rdb *redis.Client, ips ...string) {
	t.Helper()
	ctx := context.Background()
	keys := []string{"rl:proof_verify:legacy_v0:global"}
	for _, ip := range ips {
		keys = append(keys, fmt.Sprintf("rl:proof_verify:legacy_v0:ip:%s", ip))
	}
	rdb.Del(ctx, keys...)
}

const (
	legacyRef = "BZM-5EED-0A11"
	secureRef = "BZM-ABCD-2345-6789-JKMN-PQRS-TVWX"
)

func isLegacyShape(ref string) bool { return len(ref) == len(legacyRef) && ref[:4] == "BZM-" }

// call drives the middleware with a chi route param, as the real router does.
func call(t *testing.T, rdb *redis.Client, ref, ip string) *httptest.ResponseRecorder {
	t.Helper()
	reached := false
	h := ProofVerifyRateLimit(rdb, isLegacyShape)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"exists":false,"status":"NOT_FOUND"}`))
	}))
	router := chi.NewRouter()
	router.Method(http.MethodGet, "/v1/public/proofs/{ref}", h)

	req := httptest.NewRequest(http.MethodGet, "/v1/public/proofs/"+ref, nil)
	// What chi's RealIP leaves after reading the edge's headers.
	req.RemoteAddr = ip + ":40000"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	_ = reached
	return rec
}

func TestLegacyProof_PerIPCeiling(t *testing.T) {
	rdb := redisForTest(t)
	ip := "203.0.113.10"
	clearBuckets(t, rdb, ip)

	for i := 1; i <= LegacyProofPerIPPerMinute; i++ {
		if rec := call(t, rdb, legacyRef, ip); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d of %d was limited too early", i, LegacyProofPerIPPerMinute)
		}
	}
	if rec := call(t, rdb, legacyRef, ip); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request %d must be limited, got %d", LegacyProofPerIPPerMinute+1, rec.Code)
	}
}

// The property per-IP limiting alone cannot provide: many polite clients must not
// add up to an unbounded guessing budget.
func TestLegacyProof_GlobalCeilingAcrossManyClients(t *testing.T) {
	rdb := redisForTest(t)
	ips := make([]string, 0, 20)
	for i := 0; i < 20; i++ {
		ips = append(ips, fmt.Sprintf("198.51.100.%d", i))
	}
	clearBuckets(t, rdb, ips...)

	sent := 0
	for _, ip := range ips {
		for i := 0; i < LegacyProofPerIPPerMinute; i++ {
			rec := call(t, rdb, legacyRef, ip)
			if rec.Code == http.StatusTooManyRequests {
				goto exhausted
			}
			sent++
		}
	}
exhausted:
	if sent > LegacyProofGlobalPerMinute {
		t.Fatalf("global budget exceeded: %d allowed, ceiling %d", sent, LegacyProofGlobalPerMinute)
	}
	// A brand-new address must still be refused once the global budget is gone.
	// Clear ONLY this address's bucket — clearing the global one would erase the
	// exhaustion this assertion depends on.
	fresh := "198.51.100.250"
	rdb.Del(context.Background(), fmt.Sprintf("rl:proof_verify:legacy_v0:ip:%s", fresh))
	if rec := call(t, rdb, legacyRef, fresh); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("a fresh client must not bypass an exhausted global budget, got %d", rec.Code)
	}
}

// A legacy flood must not degrade the modern surface.
func TestLegacyProof_SecureV1UnaffectedByLegacyExhaustion(t *testing.T) {
	rdb := redisForTest(t)
	ip := "203.0.113.77"
	clearBuckets(t, rdb, ip)

	for i := 0; i < LegacyProofPerIPPerMinute+5; i++ {
		call(t, rdb, legacyRef, ip)
	}
	if rec := call(t, rdb, legacyRef, ip); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("legacy should be exhausted, got %d", rec.Code)
	}
	if rec := call(t, rdb, secureRef, ip); rec.Code == http.StatusTooManyRequests {
		t.Fatal("SECURE_V1 must not share the legacy bucket")
	}
}

// LEGACY_RATE_LIMIT_ORACLE = 0: under an exhausted budget a real reference and a
// guessed one must be indistinguishable.
func TestLegacyProof_LimitedResponseIsNotAnExistenceOracle(t *testing.T) {
	rdb := redisForTest(t)
	ip := "203.0.113.99"
	clearBuckets(t, rdb, ip)
	for i := 0; i < LegacyProofPerIPPerMinute; i++ {
		call(t, rdb, legacyRef, ip)
	}

	real := call(t, rdb, legacyRef, ip)        // exists in the historical set
	guess := call(t, rdb, "BZM-0000-0001", ip) // almost certainly does not

	if real.Code != http.StatusTooManyRequests || guess.Code != http.StatusTooManyRequests {
		t.Fatalf("both must be limited: real=%d guess=%d", real.Code, guess.Code)
	}
	if real.Body.String() != guess.Body.String() {
		t.Fatalf("bodies differ — the limiter leaks existence:\n real=%s\nguess=%s", real.Body.String(), guess.Body.String())
	}
	if real.Header().Get("Retry-After") != guess.Header().Get("Retry-After") {
		t.Fatal("Retry-After differs between a real and a guessed reference")
	}
}

// A degraded Redis must not take the public verifier down.
func TestLegacyProof_FailsOpenOnRedisError(t *testing.T) {
	dead := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	defer dead.Close()
	if rec := call(t, dead, legacyRef, "203.0.113.5"); rec.Code == http.StatusTooManyRequests {
		t.Fatal("a broken Redis must fail open, not block verification")
	}
}

// A caller cannot buy a fresh allowance by naming itself: a rotating
// X-Forwarded-For from one connection is still one client.
func TestLegacyProof_SpoofedForwardedForEarnsNothing(t *testing.T) {
	rdb := redisForTest(t)
	ip := "203.0.113.77"
	clearBuckets(t, rdb, ip)
	spoofed := func(n int) *httptest.ResponseRecorder {
		h := ProofVerifyRateLimit(rdb, isLegacyShape)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		router := chi.NewRouter()
		router.Method(http.MethodGet, "/v1/public/proofs/{ref}", h)
		req := httptest.NewRequest(http.MethodGet, "/v1/public/proofs/"+legacyRef, nil)
		req.RemoteAddr = ip + ":40000"
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("198.51.100.%d", n))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	for i := 1; i <= LegacyProofPerIPPerMinute; i++ {
		if rec := spoofed(i); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d limited too early", i)
		}
	}
	if rec := spoofed(99); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("a spoofed X-Forwarded-For bought request %d: status %d", LegacyProofPerIPPerMinute+1, rec.Code)
	}
}
