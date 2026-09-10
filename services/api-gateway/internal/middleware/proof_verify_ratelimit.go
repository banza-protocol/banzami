package middleware

import (
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// Legacy public proof references carry roughly 32 bits of guessing resistance —
// they were derived from a UUID prefix — against a bounded historical population
// that can never grow. SECURE_V1 carries 120. The two therefore do not deserve
// the same public throttle, and the generic anonymous ceiling is not a control
// for the weaker one: a human verifying a receipt they hold does not need more
// than one attempt every ten seconds.
const (
	// LegacyProofPerIPPerMinute bounds one client.
	LegacyProofPerIPPerMinute = 6
	// LegacyProofGlobalPerMinute bounds EVERY client together. Per-IP limiting
	// alone does not answer a distributed prober: a thousand addresses each
	// politely taking 6/min is 6000/min against a 32-bit space. The historical
	// set is tiny and finite, so a global ceiling costs legitimate readers
	// nothing and removes the arithmetic that made the attack worth running.
	LegacyProofGlobalPerMinute = 60
)

// ProofVerifyRateLimit throttles public proof verification, with a much tighter
// budget for legacy-format references.
//
// isLegacy is injected rather than imported so the canonical parser stays the one
// in the service package — a second regex here is exactly the drift this design
// has been avoiding.
//
// Order matters and is the whole security property: classify, then throttle, then
// let the handler look anything up. Rate-limiting after a lookup would make the
// 429 depend on whether the proof exists, turning the limiter itself into the
// existence oracle it is meant to deny.
func ProofVerifyRateLimit(rdb *redis.Client, isLegacy func(ref string) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ref := strings.TrimSpace(chi.URLParam(r, "ref"))
			if rdb == nil || !isLegacy(ref) {
				// SECURE_V1 and unparseable references stay on the ordinary public
				// policy applied further out. A legacy flood must not degrade
				// SECURE_V1 verification, so they never share a bucket.
				next.ServeHTTP(w, r)
				return
			}

			deny := func(global bool) {
				RecordProofVerify(RefClassLegacyV0, ProofResultRateLimited)
				if global {
					ProofVerifyLegacyBudgetExhausted.Inc()
				}
				// Identical for a real reference and a guessed one: the response
				// must carry no signal about what was asked for.
				w.Header().Set("Retry-After", "60")
				apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED",
					"too many requests — please slow down")
			}

			ip := trustedClientIP(r)
			for _, b := range []struct {
				key    string
				limit  int
				global bool
			}{
				{fmt.Sprintf("rl:proof_verify:legacy_v0:ip:%s", ip), LegacyProofPerIPPerMinute, false},
				{"rl:proof_verify:legacy_v0:global", LegacyProofGlobalPerMinute, true},
			} {
				allowed, err := slidingWindowAllow(r.Context(), rdb, b.key, b.limit, time.Minute)
				if err != nil {
					// Consistent with every other limiter here: a degraded Redis
					// must not take the public verifier down with it.
					slog.WarnContext(r.Context(), "legacy proof rate limit check failed — failing open",
						"error", err)
					continue
				}
				if !allowed {
					deny(b.global)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// trustedClientIP resolves the caller for rate-limiting purposes.
//
// The reference is deliberately NOT part of the key. Keying on it would give an
// attacker a fresh allowance for every guess, which is the opposite of a limit.
func trustedClientIP(r *http.Request) string {
	// The address chi's RealIP already resolved from the headers the edge SETS
	// (sandbox-edge.conf.template: Cloudflare's CF-Connecting-IP, trusted only
	// from Cloudflare's ranges, forwarded as X-Real-IP / True-Client-IP /
	// X-Forwarded-For — replacing, never appending to, what the caller sent).
	// Reading the first X-Forwarded-For entry here instead took the caller's own
	// word for it: rotating that header gave a fresh per-IP allowance per guess.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
