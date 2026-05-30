package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// RateLimits configures per-window request ceilings.
type RateLimits struct {
	// AuthenticatedPerMinute applies per merchant ID to authenticated requests.
	AuthenticatedPerMinute int
	// AnonymousPerMinute applies per remote IP to unauthenticated requests.
	AnonymousPerMinute int
}

// DefaultRateLimits are conservative production defaults.
var DefaultRateLimits = RateLimits{
	AuthenticatedPerMinute: 1000,
	AnonymousPerMinute:     60,
}

// RateLimit returns a Redis-backed sliding-window rate limiter middleware.
// On Redis failure the middleware fails open — a degraded Redis must not block all traffic.
func RateLimit(rdb *redis.Client, limits RateLimits) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, limit := rateLimitKey(r, limits)

			allowed, err := slidingWindowAllow(r.Context(), rdb, key, limit, time.Minute)
			if err != nil {
				slog.WarnContext(r.Context(), "rate limit check failed — failing open",
					"error", err, "key", key)
				next.ServeHTTP(w, r)
				return
			}

			if !allowed {
				w.Header().Set("Retry-After", "60")
				apierror.Respond(w, r, http.StatusTooManyRequests, "RATE_LIMITED",
					"too many requests — please slow down")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func rateLimitKey(r *http.Request, limits RateLimits) (key string, limit int) {
	if p, ok := GetPrincipal(r.Context()); ok && p.MerchantID != "" {
		return fmt.Sprintf("rl:merchant:%s", p.MerchantID), limits.AuthenticatedPerMinute
	}
	return fmt.Sprintf("rl:ip:%s", r.RemoteAddr), limits.AnonymousPerMinute
}

// slidingWindowScript is an atomic Lua script that implements a sliding-window
// rate limiter using a Redis sorted set.
//
// KEYS[1]  — the rate limit key (e.g. "rl:merchant:uuid")
// ARGV[1]  — current time in milliseconds
// ARGV[2]  — window duration in milliseconds
// ARGV[3]  — request limit within the window
// ARGV[4]  — unique member (prevents score collisions)
//
// Returns 1 if the request is allowed, 0 if the limit is exceeded.
var slidingWindowScript = redis.NewScript(`
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit     = tonumber(ARGV[3])
local member    = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_ms)

local count = redis.call('ZCARD', key)
if count >= limit then
    return 0
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window_ms)
return 1
`)

func slidingWindowAllow(
	ctx context.Context,
	rdb *redis.Client,
	key string,
	limit int,
	window time.Duration,
) (bool, error) {
	nowMS := time.Now().UnixMilli()
	member := fmt.Sprintf("%d-%s", nowMS, uuid.NewString())

	result, err := slidingWindowScript.Run(
		ctx, rdb,
		[]string{key},
		nowMS, window.Milliseconds(), limit, member,
	).Int()
	if err != nil {
		return false, fmt.Errorf("sliding window script: %w", err)
	}
	return result == 1, nil
}
