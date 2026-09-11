package handler

import (
	"sync"
	"time"
)

// TransferRateLimiter enforces per-consumer transfer limits using a fixed-window counter.
// A fixed window is simpler than a sliding window and sufficient for abuse prevention —
// burst attacks are bounded to 2× the limit across a window boundary.
type TransferRateLimiter struct {
	mu      sync.Mutex
	windows map[string]*windowCounter
	limit   int // maximum calls per window
	window  time.Duration
}

type windowCounter struct {
	count   int
	resetAt time.Time
}

// NewTransferRateLimiter creates a limiter with the given per-window limit and window duration.
func NewTransferRateLimiter(limit int, window time.Duration) *TransferRateLimiter {
	return &TransferRateLimiter{
		windows: make(map[string]*windowCounter),
		limit:   limit,
		window:  window,
	}
}

// Allow returns true if the consumer is within the rate limit, false if they are over it.
// Each Allow call that returns true consumes one unit of the consumer's allowance.
func (r *TransferRateLimiter) Allow(consumerID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	// Expired windows are dropped once the map has grown; it was never pruned,
	// so every distinct caller stayed for the life of the process (A9-05).
	if len(r.windows) >= 4096 {
		for k, w := range r.windows {
			if now.After(w.resetAt) {
				delete(r.windows, k)
			}
		}
	}
	c, ok := r.windows[consumerID]
	if !ok || now.After(c.resetAt) {
		r.windows[consumerID] = &windowCounter{
			count:   1,
			resetAt: now.Add(r.window),
		}
		return true
	}
	if c.count >= r.limit {
		return false
	}
	c.count++
	return true
}
