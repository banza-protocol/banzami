package middleware

// RT03 §1 — developer-key runtime resilience. Controlled fault-injection at the
// Gateway → Developer API authorization seam: a real DeveloperKeyClient points
// at an httptest server that simulates each failure mode. Every fault must
// FAIL CLOSED (neutral 401), never fall through to the protected handler, never
// leak internal detail, and never trigger any business action.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// protectedCalled records whether the downstream (business) handler ran.
func harness(t *testing.T, devAPI http.HandlerFunc) (http.Handler, *int32) {
	t.Helper()
	srv := httptest.NewServer(devAPI)
	t.Cleanup(srv.Close)
	client := service.NewDeveloperKeyClient(srv.URL, "internal-key")
	var called int32
	h := DeveloperKeyAuth(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&called, 1) // business handler — must NOT run on any fault
		w.WriteHeader(http.StatusOK)
	}))
	return h, &called
}

func doReq(h http.Handler, key string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func assertFailClosed(t *testing.T, rr *httptest.ResponseRecorder, called *int32, name string) {
	t.Helper()
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("%s: got %d, want 401 (fail closed)", name, rr.Code)
	}
	if atomic.LoadInt32(called) != 0 {
		t.Errorf("%s: business handler ran on a fault (must not)", name)
	}
	body := rr.Body.String()
	// No internal detail: no host, stack trace, SQL, credential, or the dev-api URL.
	for _, leak := range []string{"httptest", "internal-key", "127.0.0.1", "SQLSTATE", "goroutine", "panic:", "pq:"} {
		if strings.Contains(body, leak) {
			t.Errorf("%s: response leaks internal detail %q: %s", name, leak, body)
		}
	}
}

func TestDeveloperKeyResilience_FailClosed(t *testing.T) {
	valid := "bz_test_sk_validlookingkey"

	t.Run("1_timeout", func(t *testing.T) {
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(6 * time.Second) // exceeds the 5s client timeout
			w.WriteHeader(200)
		})
		assertFailClosed(t, doReq(h, valid), called, "timeout")
	})

	t.Run("3_5xx", func(t *testing.T) {
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"sql":"SELECT * FROM dev_api_keys — pq: connection refused"}`, 500)
		})
		assertFailClosed(t, doReq(h, valid), called, "5xx")
	})

	t.Run("4_malformed", func(t *testing.T) {
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			w.Write([]byte(`{"environment": "SANDBOX", not valid json`))
		})
		assertFailClosed(t, doReq(h, valid), called, "malformed")
	})

	t.Run("4b_incomplete", func(t *testing.T) {
		// 200 with empty body → decode yields zero-value; environment != SANDBOX → deny.
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			w.Write([]byte(`{}`))
		})
		assertFailClosed(t, doReq(h, valid), called, "incomplete")
	})

	t.Run("5_invalid_environment_live", func(t *testing.T) {
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(service.DeveloperKeyContext{KeyID: "k", Environment: "LIVE", Scopes: []string{"identity:read"}})
		})
		assertFailClosed(t, doReq(h, valid), called, "invalid-env-live")
	})

	t.Run("2_network_unreachable", func(t *testing.T) {
		// Point at a closed port → connection refused.
		client := service.NewDeveloperKeyClient("http://127.0.0.1:1", "k")
		var called int32
		h := DeveloperKeyAuth(client)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&called, 1); w.WriteHeader(200)
		}))
		assertFailClosed(t, doReq(h, valid), &called, "network-unreachable")
	})

	t.Run("6_concurrent_unavailable", func(t *testing.T) {
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "down", 503) })
		var wg sync.WaitGroup
		for i := 0; i < 25; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); assertFailClosed(t, doReq(h, valid), called, "concurrent") }()
		}
		wg.Wait()
	})

	t.Run("bz_live_rejected_before_introspection", func(t *testing.T) {
		var hit int32
		h, called := harness(t, func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&hit, 1) // must NOT be reached — bz_live rejected first
			w.WriteHeader(200)
		})
		assertFailClosed(t, doReq(h, "bz_live_sk_forged"), called, "bz_live")
		if atomic.LoadInt32(&hit) != 0 {
			t.Error("bz_live_ key reached the Developer API (must be rejected before introspection)")
		}
	})
}
