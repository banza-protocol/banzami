package edgestatus

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func serve(t *testing.T, path string, status int, skip ...string) *httptest.ResponseRecorder {
	t.Helper()
	h := Middleware(skip...)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"code":"UPSTREAM_ERROR","request_id":"r1"}`))
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// The edge replaces a 502/504 body; the client must still read the code.
func TestEdgeStatus_502And504BecomeReadable503(t *testing.T) {
	for _, st := range []int{http.StatusBadGateway, http.StatusGatewayTimeout} {
		rec := serve(t, "/v1/refunds", st, "/internal/")
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%d reached the edge as %d", st, rec.Code)
		}
		if rec.Header().Get(UpstreamStatusHeader) != strconv.Itoa(st) || rec.Body.String() == "" {
			t.Fatalf("%d: upstream header %q body %q", st, rec.Header().Get(UpstreamStatusHeader), rec.Body.String())
		}
	}
}

func TestEdgeStatus_OtherStatusesAndInternalRoutesUntouched(t *testing.T) {
	for _, st := range []int{200, 400, 409, 422, 429, 500, 503} {
		if rec := serve(t, "/v1/me", st, "/internal/"); rec.Code != st || rec.Header().Get(UpstreamStatusHeader) != "" {
			t.Fatalf("%d became %d", st, rec.Code)
		}
	}
	if rec := serve(t, "/internal/v1/x", http.StatusBadGateway, "/internal/"); rec.Code != http.StatusBadGateway {
		t.Fatalf("an internal route was rewritten: %d", rec.Code)
	}
}

func TestEdgeStatus_StreamingStillFlushes(t *testing.T) {
	var flushed bool
	h := Middleware()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		f, ok := w.(http.Flusher)
		flushed = ok
		if ok {
			f.Flush()
		}
		if http.NewResponseController(w) == nil {
			t.Fatal("no response controller")
		}
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/realtime/payment-sessions/x", nil))
	if !flushed {
		t.Fatal("the wrapper hid http.Flusher: SSE would buffer")
	}
}
