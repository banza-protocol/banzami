package server

// Who the client is on the consumer sign-in limiter (10/min per client):
// A9-09 (headers believed from any peer) and A9-04 (IPv6 rotation). The handler
// behind the limiter has no dependencies here and fails; only whether the
// LIMITER answered 429 matters.

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/common/clientip"
	"github.com/banzami/banzami/services/public-api/internal/config"
)

func tokenCall(h http.Handler, remote string, hdr map[string]string) int {
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Code
}

func handlerWith(res *clientip.Resolver) http.Handler {
	return New(&config.Config{Port: 8083, Environment: "sandbox", JWTSecret: "0123456789abcdef0123456789abcdef", ClientIP: res}, Dependencies{}).httpServer.Handler
}

func TestClientIP_UntrustedPeerCannotRotateHeaders(t *testing.T) {
	h := handlerWith(nil)
	for i := 1; i <= authRateLimit+1; i++ {
		spoof := fmt.Sprintf("198.51.100.%d", i)
		code := tokenCall(h, fmt.Sprintf("203.0.113.9:%d", 40000+i), map[string]string{
			"True-Client-IP": spoof, "X-Real-IP": spoof, "X-Forwarded-For": spoof,
		})
		if i == authRateLimit+1 && code != http.StatusTooManyRequests {
			t.Fatalf("request %d from one peer with rotated client headers got %d, want 429", i, code)
		}
	}
}

func TestClientIP_TrustedEdgeNamesTheClient(t *testing.T) {
	h := handlerWith(clientip.New(clientip.HeaderRealIP, []netip.Prefix{netip.MustParsePrefix("172.18.0.5/32")}))
	for i := 1; i <= authRateLimit; i++ {
		tokenCall(h, "172.18.0.5:40000", map[string]string{"X-Real-IP": "198.51.100.1"})
	}
	if code := tokenCall(h, "172.18.0.5:40000", map[string]string{"X-Real-IP": "198.51.100.1"}); code != http.StatusTooManyRequests {
		t.Fatalf("client A over its limit got %d, want 429", code)
	}
	if code := tokenCall(h, "172.18.0.5:40000", map[string]string{"X-Real-IP": "198.51.100.2"}); code == http.StatusTooManyRequests {
		t.Fatal("client B was limited by client A's use: the edge's X-Real-IP was not believed")
	}
}

func TestClientIP_IPv6RotationWithinA64IsOneClient(t *testing.T) {
	h := handlerWith(nil)
	for i := 1; i <= authRateLimit+1; i++ {
		code := tokenCall(h, fmt.Sprintf("[2001:db8:88:1::%x]:443", i), nil)
		if i == authRateLimit+1 && code != http.StatusTooManyRequests {
			t.Fatalf("request %d from a fresh address in the same /64 got %d, want 429", i, code)
		}
	}
	if code := tokenCall(h, "[2001:db8:88:2::1]:443", nil); code == http.StatusTooManyRequests {
		t.Fatal("a different /64 shared the bucket")
	}
}
