package accountidentity

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter bounds OTP abuse: a fixed-window counter (Allow) plus a resend
// cooldown (Cooldown). Keys are opaque (e.g. "otp:email:<hash>").
type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
	Cooldown(ctx context.Context, key string, window time.Duration) (allowed bool, retryAfter time.Duration, err error)
}

// ── Redis implementation ─────────────────────────────────────────────────────

type redisLimiter struct{ rdb *redis.Client }

// NewRedisLimiter builds a Redis-backed limiter.
func NewRedisLimiter(rdb *redis.Client) RateLimiter { return &redisLimiter{rdb: rdb} }

func (l *redisLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	n, err := l.rdb.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if n == 1 {
		_ = l.rdb.Expire(ctx, key, window).Err()
	}
	return n <= int64(limit), nil
}

func (l *redisLimiter) Cooldown(ctx context.Context, key string, window time.Duration) (bool, time.Duration, error) {
	ok, err := l.rdb.SetNX(ctx, key, "1", window).Result()
	if err != nil {
		return false, 0, err
	}
	if ok {
		return true, 0, nil
	}
	ttl, _ := l.rdb.TTL(ctx, key).Result()
	return false, ttl, nil
}

// ── In-memory implementation (tests / local) ─────────────────────────────────

type memLimiter struct {
	mu       sync.Mutex
	counts   map[string]*window
	cooldown map[string]time.Time
}

type window struct {
	count   int
	resetAt time.Time
}

// NewMemLimiter builds an in-memory limiter.
func NewMemLimiter() *memLimiter {
	return &memLimiter{counts: map[string]*window{}, cooldown: map[string]time.Time{}}
}

func (l *memLimiter) Allow(_ context.Context, key string, limit int, w time.Duration) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	// It is also the fallback while Redis is unreachable (Service.local), so it
	// must not grow without bound over a long outage.
	if len(l.counts) > 10000 {
		for k, c := range l.counts {
			if now.After(c.resetAt) {
				delete(l.counts, k)
			}
		}
	}
	cur := l.counts[key]
	if cur == nil || now.After(cur.resetAt) {
		cur = &window{resetAt: now.Add(w)}
		l.counts[key] = cur
	}
	cur.count++
	return cur.count <= limit, nil
}

func (l *memLimiter) Cooldown(_ context.Context, key string, w time.Duration) (bool, time.Duration, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if until, ok := l.cooldown[key]; ok && now.Before(until) {
		return false, until.Sub(now), nil
	}
	l.cooldown[key] = now.Add(w)
	return true, 0, nil
}
