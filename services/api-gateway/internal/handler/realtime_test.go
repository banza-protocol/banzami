package handler

import (
	"bufio"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type rtSessions struct {
	mu     sync.Mutex
	status map[string]string
	reads  int
}

func (f *rtSessions) Get(_ context.Context, id string) (*service.PaymentSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	st, ok := f.status[id]
	if !ok {
		return nil, errors.New("not found")
	}
	amt := int64(250000)
	return &service.PaymentSession{SessionID: id, MerchantID: "merchant-secret-id", WalletID: "wallet-secret-id", WalletAccountID: "acct-secret-id", Status: st, AmountMinor: &amt, Currency: "AOA"}, nil
}

func (f *rtSessions) set(id, st string) { f.mu.Lock(); f.status[id] = st; f.mu.Unlock() }

func realtimeRouter(h *RealtimeHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/v1/realtime/payment-sessions/{id}", h.Status)
	return r
}

func newRealtime(t *testing.T) (*RealtimeHandler, *rtSessions, *service.RealtimeTokens) {
	t.Helper()
	tokens := service.NewRealtimeTokens("0123456789abcdef0123456789abcdef", "SANDBOX")
	fs := &rtSessions{status: map[string]string{"sess-A": "ACTIVE", "sess-B": "ACTIVE"}}
	h := NewRealtimeHandler(tokens, fs)
	h.poll = 20 * time.Millisecond
	h.beat = 30 * time.Millisecond
	return h, fs, tokens
}

func TestRealtime_SnapshotIsPublicFieldsOnly(t *testing.T) {
	h, _, tokens := newRealtime(t)
	tok, _ := tokens.Mint("sess-A")
	req := httptest.NewRequest(http.MethodGet, "/v1/realtime/payment-sessions/sess-A", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	realtimeRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("snapshot: %d %s", rec.Code, rec.Body)
	}
	body := rec.Body.String()
	for _, private := range []string{"merchant-secret-id", "wallet-secret-id", "acct-secret-id", "merchant_id", "wallet"} {
		if strings.Contains(body, private) {
			t.Fatalf("snapshot leaks %q: %s", private, body)
		}
	}
	if !strings.Contains(body, `"status":"ACTIVE"`) || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("snapshot body/CORS: %s %v", body, rec.Header())
	}
}

func TestRealtime_AuthorizationRefusals(t *testing.T) {
	h, _, tokens := newRealtime(t)
	tokA, _ := tokens.Mint("sess-A")
	cases := []struct {
		name, path, auth string
		want             int
		code             string
	}{
		{"no token", "/v1/realtime/payment-sessions/sess-A", "", 401, "REALTIME_TOKEN_REQUIRED"},
		{"token for another session", "/v1/realtime/payment-sessions/sess-B", "Bearer " + tokA, 403, "REALTIME_TOKEN_WRONG_RESOURCE"},
		{"garbage", "/v1/realtime/payment-sessions/sess-A", "Bearer bzst_nope.nope", 401, "REALTIME_TOKEN_INVALID"},
		{"an API key is not a status token", "/v1/realtime/payment-sessions/sess-A", "Bearer bz_test_sk_XXXXXXXXXXXXXXXX", 401, "REALTIME_TOKEN_INVALID"},
		{"token in the URL", "/v1/realtime/payment-sessions/sess-A?token=" + tokA, "Bearer " + tokA, 400, "REALTIME_TOKEN_IN_URL"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		if c.auth != "" {
			req.Header.Set("Authorization", c.auth)
		}
		rec := httptest.NewRecorder()
		realtimeRouter(h).ServeHTTP(rec, req)
		if rec.Code != c.want || !strings.Contains(rec.Body.String(), c.code) {
			t.Errorf("%s: got %d %s, want %d %s", c.name, rec.Code, rec.Body, c.want, c.code)
		}
	}
	// No write method exists on the route: the token cannot mutate anything.
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		req := httptest.NewRequest(m, "/v1/realtime/payment-sessions/sess-A", nil)
		req.Header.Set("Authorization", "Bearer "+tokA)
		rec := httptest.NewRecorder()
		realtimeRouter(h).ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s answered %d — the realtime route must have no write method", m, rec.Code)
		}
	}
}

func readEvents(t *testing.T, srvURL, path, token string, until func([]string) bool) []string {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, srvURL+path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content type %q", ct)
	}
	var lines []string
	sc := bufio.NewScanner(resp.Body)
	deadline := time.After(3 * time.Second)
	done := make(chan struct{})
	go func() {
		for sc.Scan() {
			lines = append(lines, sc.Text())
			if until(lines) {
				break
			}
		}
		close(done)
	}()
	select {
	case <-done:
	case <-deadline:
		t.Fatalf("stream did not finish; got %v", lines)
	}
	return lines
}

func TestRealtime_StreamSnapshotChangeTerminalClose(t *testing.T) {
	h, fs, tokens := newRealtime(t)
	srv := httptest.NewServer(realtimeRouter(h))
	defer srv.Close()
	tok, _ := tokens.Mint("sess-A")
	go func() { time.Sleep(120 * time.Millisecond); fs.set("sess-A", "PAID") }()
	lines := readEvents(t, srv.URL, "/v1/realtime/payment-sessions/sess-A", tok, func([]string) bool { return false })
	joined := strings.Join(lines, "\n")
	iSnap := strings.Index(joined, "event: snapshot")
	iPaid := strings.Index(joined, "event: status")
	if iSnap < 0 || iPaid < 0 || iSnap > iPaid {
		t.Fatalf("want snapshot then status: %s", joined)
	}
	if !strings.Contains(joined[iPaid:], `"status":"PAID"`) || !strings.Contains(joined[iPaid:], `"terminal":true`) {
		t.Fatalf("status event: %s", joined)
	}
	if strings.Contains(joined, "event: heartbeat") {
		t.Fatal("a heartbeat was sent as an event; it must be a comment")
	}
}

func TestRealtime_ReconnectAfterTerminalGetsCurrentState(t *testing.T) {
	h, fs, tokens := newRealtime(t)
	fs.set("sess-A", "PAID")
	srv := httptest.NewServer(realtimeRouter(h))
	defer srv.Close()
	tok, _ := tokens.Mint("sess-A")
	lines := readEvents(t, srv.URL, "/v1/realtime/payment-sessions/sess-A", tok, func([]string) bool { return false })
	joined := strings.Join(lines, "\n")
	if !strings.Contains(joined, "event: snapshot") || !strings.Contains(joined, `"status":"PAID"`) || strings.Contains(joined, "event: status") {
		t.Fatalf("a reconnect after PAID must receive one PAID snapshot and close: %s", joined)
	}
}

func TestRealtime_PerSessionStreamLimit(t *testing.T) {
	h, _, tokens := newRealtime(t)
	tok, _ := tokens.Mint("sess-A")
	for i := 0; i < RealtimeMaxPerSession; i++ {
		if _, _, ok := h.admit("sess-A", "198.51.100."+string(rune('1'+i))); !ok {
			t.Fatalf("stream %d refused below the limit", i+1)
		}
	}
	srv := httptest.NewServer(realtimeRouter(h))
	defer srv.Close()
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/v1/realtime/payment-sessions/sess-A", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests || resp.Header.Get("Retry-After") != strconv.Itoa(int(RealtimeHeartbeat.Seconds())) {
		t.Fatalf("over the per-session limit: %d Retry-After=%q", resp.StatusCode, resp.Header.Get("Retry-After"))
	}
}

// A dead stream behind Cloudflare keeps its place until a write fails, so the
// heartbeat bounds how long a reloaded page can be refused a stream (measured on
// the deployed Sandbox: 15 s with a 15 s heartbeat).
func TestRealtime_HeartbeatBoundsHowLongADeadStreamHoldsItsPlace(t *testing.T) {
	if RealtimeHeartbeat > 5*time.Second {
		t.Fatalf("heartbeat %s: an abandoned stream would hold a place for that long behind a proxy", RealtimeHeartbeat)
	}
	if RealtimeHeartbeat < time.Second {
		t.Fatalf("heartbeat %s is below the poll interval; it adds traffic and frees nothing sooner", RealtimeHeartbeat)
	}
}
