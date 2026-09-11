package server

// Who the client is, as the full production router decides it (A9-09, A9-04).
//
// Driven through newRouter against the credential limiter (15/min per client,
// counted in-process because Dependencies carries no Redis). The handler behind
// it has no services and fails; only whether the LIMITER answered 429 matters.

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/config"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/common/clientip"
)

const edgeAddr = "172.18.0.5"

func routerWithClientIP(res *clientip.Resolver) http.Handler {
	return newRouter(&config.Config{
		Port: 8080, Environment: "SANDBOX",
		JWTSecret: "0123456789abcdef0123456789abcdef",
		ClientIP:  res,
	}, Dependencies{})
}

func credCall(h http.Handler, remote string, hdr map[string]string) int {
	req := httptest.NewRequest(http.MethodPost, "/v1/merchant/auth/lookup", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Code
}

// An untrusted peer — any container on the Sandbox network, or anything that
// reaches the port directly — named itself afresh on every request through the
// headers chi's RealIP believed, and never met the limit.
func TestClientIP_UntrustedPeerCannotRotateHeaders(t *testing.T) {
	h := routerWithClientIP(nil) // the default: no proxy trusted
	for i := 1; i <= middleware.CredentialPerMinute+1; i++ {
		spoof := fmt.Sprintf("198.51.100.%d", i)
		code := credCall(h, fmt.Sprintf("203.0.113.9:%d", 40000+i), map[string]string{
			"True-Client-IP":   spoof,
			"X-Real-IP":        spoof,
			"X-Forwarded-For":  spoof,
			"CF-Connecting-IP": spoof,
		})
		if i <= middleware.CredentialPerMinute && code == http.StatusTooManyRequests {
			t.Fatalf("request %d limited early", i)
		}
		if i == middleware.CredentialPerMinute+1 && code != http.StatusTooManyRequests {
			t.Fatalf("request %d from one peer with rotated client headers got %d, want 429", i, code)
		}
	}
}

// The trusted edge names each client in X-Real-IP, and each has its own bucket.
func TestClientIP_TrustedEdgeNamesTheClient(t *testing.T) {
	h := routerWithClientIP(clientip.New(clientip.HeaderRealIP, []netip.Prefix{netip.MustParsePrefix(edgeAddr + "/32")}))
	for i := 1; i <= middleware.CredentialPerMinute; i++ {
		credCall(h, edgeAddr+":40000", map[string]string{"X-Real-IP": "198.51.100.1"})
	}
	if code := credCall(h, edgeAddr+":40000", map[string]string{"X-Real-IP": "198.51.100.1"}); code != http.StatusTooManyRequests {
		t.Fatalf("client A over its limit got %d, want 429", code)
	}
	if code := credCall(h, edgeAddr+":40000", map[string]string{"X-Real-IP": "198.51.100.2"}); code == http.StatusTooManyRequests {
		t.Fatal("client B was limited by client A's use: the edge's X-Real-IP was not believed")
	}
}

// A9-04: one IPv6 subscriber rotating through its /64 is one client.
func TestClientIP_IPv6RotationWithinA64IsOneClient(t *testing.T) {
	h := routerWithClientIP(nil)
	for i := 1; i <= middleware.CredentialPerMinute+1; i++ {
		code := credCall(h, fmt.Sprintf("[2001:db8:77:1::%x]:443", i), nil)
		if i == middleware.CredentialPerMinute+1 && code != http.StatusTooManyRequests {
			t.Fatalf("request %d from a fresh address in the same /64 got %d, want 429", i, code)
		}
	}
	// The neighbouring /64 is somebody else.
	if code := credCall(h, "[2001:db8:77:2::1]:443", nil); code == http.StatusTooManyRequests {
		t.Fatal("a different /64 shared the bucket")
	}
}
