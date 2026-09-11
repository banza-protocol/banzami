package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// Without a working Redis the per-IP credential limit still holds, counted in
// this process. It used to let everything through.
func TestRateLimitPerIP_WithoutRedisStillLimits(t *testing.T) {
	unreachable := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", DialTimeout: 50 * time.Millisecond, MaxRetries: -1})
	defer unreachable.Close()
	for name, rdb := range map[string]*redis.Client{"no redis": nil, "redis down": unreachable} {
		t.Run(name, func(t *testing.T) {
			h := RateLimitPerIP(rdb, 3, "test")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			codes := []int{}
			for i := 0; i < 5; i++ {
				r := httptest.NewRequest("POST", "/v1/auth/token", nil)
				r.RemoteAddr = "198.51.100.7"
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				codes = append(codes, w.Code)
			}
			want := []int{204, 204, 204, 429, 429}
			for i := range want {
				if codes[i] != want[i] {
					t.Fatalf("codes %v, want %v", codes, want)
				}
			}
			// Another address has its own budget.
			r := httptest.NewRequest("POST", "/v1/auth/token", nil)
			r.RemoteAddr = "198.51.100.8"
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 204 {
				t.Fatalf("a different address was limited: %d", w.Code)
			}
		})
	}
}
