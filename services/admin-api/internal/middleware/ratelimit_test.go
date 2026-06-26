package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_AllowsUpToLimitThenBlocks(t *testing.T) {
	l := NewIPRateLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if ok, _ := l.allow("1.2.3.4"); !ok {
			t.Fatalf("request %d within limit must pass", i+1)
		}
	}
	ok, retry := l.allow("1.2.3.4")
	if ok {
		t.Fatal("4th request must be blocked")
	}
	if retry <= 0 {
		t.Fatalf("blocked response must carry a positive Retry-After, got %d", retry)
	}
}

func TestRateLimiter_PerIPIsolation(t *testing.T) {
	l := NewIPRateLimiter(1, time.Minute)
	if ok, _ := l.allow("10.0.0.1"); !ok {
		t.Fatal("first IP first request must pass")
	}
	if ok, _ := l.allow("10.0.0.2"); !ok {
		t.Fatal("a different IP must not be affected by another IP's usage")
	}
	if ok, _ := l.allow("10.0.0.1"); ok {
		t.Fatal("first IP second request must be blocked")
	}
}

func TestRateLimiter_WindowResets(t *testing.T) {
	l := NewIPRateLimiter(1, time.Minute)
	base := time.Unix(1_700_000_000, 0)
	l.now = func() time.Time { return base }
	if ok, _ := l.allow("9.9.9.9"); !ok {
		t.Fatal("first request must pass")
	}
	if ok, _ := l.allow("9.9.9.9"); ok {
		t.Fatal("second request in-window must be blocked")
	}
	l.now = func() time.Time { return base.Add(61 * time.Second) }
	if ok, _ := l.allow("9.9.9.9"); !ok {
		t.Fatal("request after the window resets must pass")
	}
}

func TestRateLimiter_Middleware429(t *testing.T) {
	l := NewIPRateLimiter(1, time.Minute)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/admin/v1/auth/login", nil)
		r.Header.Set("X-Real-IP", "7.7.7.7")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := call(); w.Code != http.StatusOK {
		t.Fatalf("first call must pass, got %d", w.Code)
	}
	w := call()
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("second call must be 429, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("429 must include Retry-After")
	}
}
