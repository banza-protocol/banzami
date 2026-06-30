package handler

import (
	"testing"
	"time"
)

// Audit Part 14 / bug #7: the unauthenticated auth endpoints are throttled per
// client IP by this limiter. These tests lock the three properties that matter
// for brute-force / enumeration defense: the ceiling applies, the window resets,
// and one key's allowance never spends another's.
func TestTransferRateLimiter_LimitApplies(t *testing.T) {
	rl := NewTransferRateLimiter(3, time.Minute)
	ip := "203.0.113.7:5555"
	for i := 0; i < 3; i++ {
		if !rl.Allow(ip) {
			t.Fatalf("request %d should be allowed (under the limit)", i+1)
		}
	}
	if rl.Allow(ip) {
		t.Fatal("4th request must be denied — limit is 3 per window")
	}
}

func TestTransferRateLimiter_WindowResets(t *testing.T) {
	rl := NewTransferRateLimiter(1, 20*time.Millisecond)
	ip := "203.0.113.7:5555"
	if !rl.Allow(ip) {
		t.Fatal("first request should be allowed")
	}
	if rl.Allow(ip) {
		t.Fatal("second request in the same window must be denied")
	}
	time.Sleep(30 * time.Millisecond) // let the window roll over
	if !rl.Allow(ip) {
		t.Fatal("request after the window expires should be allowed again")
	}
}

func TestTransferRateLimiter_PerKeyIsolation(t *testing.T) {
	rl := NewTransferRateLimiter(1, time.Minute)
	a, b := "203.0.113.1:1111", "203.0.113.2:2222"
	if !rl.Allow(a) {
		t.Fatal("first IP should be allowed")
	}
	if !rl.Allow(b) {
		t.Fatal("a different IP must have its own independent allowance")
	}
	if rl.Allow(a) {
		t.Fatal("first IP is now over its own limit and must be denied")
	}
}
