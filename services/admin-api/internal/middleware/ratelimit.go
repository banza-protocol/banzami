package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/banzami/banzami/services/common/clientip"
)

// IPRateLimiter is a fixed-window per-IP limiter for the unauthenticated auth
// endpoints (login, password-reset validate/complete, change-password). It
// protects against credential-stuffing and reset-token brute force WITHOUT ever
// throttling authenticated operators on normal endpoints — it is mounted only on
// the auth routes. In-memory and per-instance, which is sufficient for the
// single admin-api process; a distributed limiter can replace it if the service
// is ever horizontally scaled.
type IPRateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    func() time.Time
	hits   map[string]*window
}

type window struct {
	count int
	reset time.Time
}

// NewIPRateLimiter allows up to limit requests per window per client IP.
func NewIPRateLimiter(limit int, w time.Duration) *IPRateLimiter {
	return &IPRateLimiter{limit: limit, window: w, now: time.Now, hits: make(map[string]*window)}
}

// allow records a hit for ip and reports whether it is within the limit, plus
// the seconds until the window resets (for Retry-After).
func (l *IPRateLimiter) allow(ip string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	w, ok := l.hits[ip]
	if !ok || now.After(w.reset) {
		l.hits[ip] = &window{count: 1, reset: now.Add(l.window)}
		l.sweep(now)
		return true, 0
	}
	w.count++
	retry := int(w.reset.Sub(now).Seconds()) + 1
	return w.count <= l.limit, retry
}

// sweep drops expired buckets so the map can't grow unbounded. Cheap: runs only
// when a fresh window is created.
func (l *IPRateLimiter) sweep(now time.Time) {
	for k, w := range l.hits {
		if now.After(w.reset) {
			delete(l.hits, k)
		}
	}
}

// Middleware enforces the limit, keyed on the client clientip resolved
// (RemoteAddr) — per address, and per /64 for IPv6 so rotating through one's
// own block buys nothing (A9-04).
func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, retry := l.allow(clientip.LimiterKey(r.RemoteAddr))
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			deny(w, http.StatusTooManyRequests, "TOO_MANY_REQUESTS", "too many requests, please slow down")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// realIP is the client address clientip resolved at the edge of this service
// (RemoteAddr). It read X-Real-IP and X-Forwarded-For itself, from any peer,
// so a caller wrote its own address into the audit log and its own limiter
// key (A9-09).
func realIP(r *http.Request) string { return clientip.Host(r.RemoteAddr) }

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
