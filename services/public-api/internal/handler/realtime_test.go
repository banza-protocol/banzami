package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	apimiddleware "github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ---------------------------------------------------------------------------
// Test double — a per-consumer canonical reader. Every read is keyed strictly
// by consumerID, so the fake cannot accidentally leak one consumer into
// another's stream (the isolation property under test).
// ---------------------------------------------------------------------------

type fakeWalletReader struct {
	mu sync.Mutex
	// consumerID -> canonical state
	available map[string]int64
	marker    map[string]string
	// consumerID -> force wallet-not-found (a consumer without a wallet yet)
	noWallet map[string]bool
	reads    int
}

func newFakeWalletReader() *fakeWalletReader {
	return &fakeWalletReader{
		available: map[string]int64{},
		marker:    map[string]string{},
		noWallet:  map[string]bool{},
	}
}

func (f *fakeWalletReader) set(consumerID string, available int64, marker string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.available[consumerID] = available
	f.marker[consumerID] = marker
}

func (f *fakeWalletReader) GetWalletForConsumer(_ context.Context, consumerID, currency string) (*service.ConsumerWalletRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.noWallet[consumerID] {
		return nil, service.ErrConsumerWalletNotFound
	}
	// The wallet id is derived from the consumer id: a read for consumer A can
	// only resolve to A's wallet.
	return &service.ConsumerWalletRecord{ID: "wallet-" + consumerID, ConsumerID: consumerID, Currency: currency, Status: "ACTIVE"}, nil
}

func (f *fakeWalletReader) GetWalletBalance(_ context.Context, walletID string) (*service.ConsumerWalletBalance, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	consumerID := strings.TrimPrefix(walletID, "wallet-")
	return &service.ConsumerWalletBalance{
		WalletID:       walletID,
		ConsumerID:     consumerID,
		Currency:       consumerRealtimeCurrency,
		AvailableMinor: f.available[consumerID],
	}, nil
}

func (f *fakeWalletReader) GetActivity(_ context.Context, consumerID string, _ int, _, _, _ string) (*service.ActivityPage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m := f.marker[consumerID]
	if m == "" {
		return &service.ActivityPage{Items: []service.ActivityItem{}}, nil
	}
	return &service.ActivityPage{Items: []service.ActivityItem{{ActivityID: m}}}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newConsumerRealtime(t *testing.T) (*ConsumerRealtimeHandler, *fakeWalletReader) {
	t.Helper()
	fr := newFakeWalletReader()
	h := newConsumerRealtimeHandler(fr)
	h.poll = 20 * time.Millisecond
	h.beat = 30 * time.Millisecond
	h.maxLife = time.Hour
	return h, fr
}

// realtimeReq builds an authenticated request. consumerID == "" leaves the
// request unauthenticated.
func realtimeReq(method, path, consumerID string, expiresAt time.Time) *http.Request {
	r := httptest.NewRequest(method, path, nil)
	ctx := context.WithValue(r.Context(), chimiddleware.RequestIDKey, "req-test-realtime")
	if consumerID != "" {
		ctx = apimiddleware.InjectConsumer(ctx, &apimiddleware.Consumer{ID: consumerID, Scopes: []string{}, ExpiresAt: expiresAt})
	}
	return r.WithContext(ctx)
}

// streamRead opens an SSE request through a live server and returns the lines
// gathered until `until` is satisfied or the deadline elapses.
func streamRead(t *testing.T, srvURL, path string, until func([]string) bool) []string {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, srvURL+path, nil)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content type %q (body indicates non-stream)", ct)
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

// authInjector wraps a handler so streamRead's request carries an authenticated
// consumer (httptest.NewServer runs the real net/http stack, not the router's
// Auth middleware).
func authInjector(consumerID string, expiresAt time.Time, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := apimiddleware.InjectConsumer(r.Context(), &apimiddleware.Consumer{ID: consumerID, Scopes: []string{}, ExpiresAt: expiresAt})
		next(w, r.WithContext(ctx))
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

//  1. Snapshot fallback: a plain (non-stream) read returns one JSON snapshot of
//     this consumer's own available balance + marker.
func TestConsumerRealtime_JSONSnapshot(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.set("consumer-1", 500000, "act-1")

	w := httptest.NewRecorder()
	h.Realtime(w, realtimeReq(http.MethodGet, "/v1/me/realtime", "consumer-1", time.Time{}))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body)
	}
	var snap walletSnapshot
	if err := json.NewDecoder(w.Body).Decode(&snap); err != nil {
		t.Fatal(err)
	}
	if snap.AvailableMinor != 500000 {
		t.Errorf("expected available 500000, got %d", snap.AvailableMinor)
	}
	if snap.Currency != "AOA" {
		t.Errorf("expected AOA, got %q", snap.Currency)
	}
	if snap.ActivityMarker == "" {
		t.Errorf("expected an activity marker")
	}
	if snap.At == "" {
		t.Errorf("expected an observation time")
	}
}

// 2. 401 without an authenticated consumer.
func TestConsumerRealtime_Unauthenticated(t *testing.T) {
	h, _ := newConsumerRealtime(t)
	w := httptest.NewRecorder()
	h.Realtime(w, realtimeReq(http.MethodGet, "/v1/me/realtime", "", time.Time{}))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

//  3. Stream: snapshot first, then wallet.changed on a simulated balance change,
//     and a heartbeat comment (never an event).
func TestConsumerRealtime_StreamSnapshotThenChange(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.set("consumer-1", 100000, "act-1")

	srv := httptest.NewServer(authInjector("consumer-1", time.Time{}, h.Realtime))
	defer srv.Close()

	go func() {
		time.Sleep(120 * time.Millisecond)
		fr.set("consumer-1", 250000, "act-2")
	}()

	lines := streamRead(t, srv.URL, "/v1/me/realtime",
		func(ls []string) bool {
			return strings.Contains(strings.Join(ls, "\n"), `"available_minor":250000`)
		})
	joined := strings.Join(lines, "\n")

	iSnap := strings.Index(joined, "event: snapshot")
	iChange := strings.Index(joined, "event: wallet.changed")
	if iSnap < 0 || iChange < 0 || iSnap > iChange {
		t.Fatalf("want snapshot then wallet.changed: %s", joined)
	}
	if !strings.Contains(joined[iChange:], `"available_minor":250000`) {
		t.Fatalf("wallet.changed did not carry the new balance: %s", joined)
	}
	if !strings.Contains(joined, "retry: 3000") {
		t.Fatalf("stream must open with retry: %s", joined)
	}
	if strings.Contains(joined, "event: heartbeat") {
		t.Fatal("a heartbeat was sent as an event; it must be a comment")
	}
	if !strings.Contains(joined, ": heartbeat") {
		t.Fatalf("expected a heartbeat comment: %s", joined)
	}
}

// 4. Stream closes with event: expired when the session lifetime ends.
func TestConsumerRealtime_ExpiredClose(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.set("consumer-1", 100000, "act-1")

	// A short absolute lifetime: the token expires ~150 ms out.
	exp := time.Now().Add(150 * time.Millisecond)
	srv := httptest.NewServer(authInjector("consumer-1", exp, h.Realtime))
	defer srv.Close()

	lines := streamRead(t, srv.URL, "/v1/me/realtime",
		func(ls []string) bool {
			return strings.Contains(strings.Join(ls, "\n"), "event: expired")
		})
	joined := strings.Join(lines, "\n")
	if !strings.Contains(joined, "event: snapshot") || !strings.Contains(joined, "event: expired") {
		t.Fatalf("want snapshot then expired: %s", joined)
	}
}

// 5. Per-consumer cap: the (N+1)th concurrent stream is refused 429 + Retry-After.
func TestConsumerRealtime_PerConsumerCap(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.set("consumer-1", 100000, "act-1")

	for i := 0; i < ConsumerRealtimeMaxPerConsumer; i++ {
		if _, _, ok := h.admit("consumer-1", "198.51.100."+strconv.Itoa(i+1)); !ok {
			t.Fatalf("stream %d refused below the per-consumer cap", i+1)
		}
	}
	srv := httptest.NewServer(authInjector("consumer-1", time.Time{}, h.Realtime))
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/v1/me/realtime", nil)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("over the per-consumer cap: got %d", resp.StatusCode)
	}
	if resp.Header.Get("Retry-After") != strconv.Itoa(int(ConsumerRealtimeHeartbeat.Seconds())) {
		t.Fatalf("expected Retry-After %d, got %q", int(ConsumerRealtimeHeartbeat.Seconds()), resp.Header.Get("Retry-After"))
	}
}

// 6. Per-IP cap: past the per-IP limit, admit refuses regardless of consumer.
func TestConsumerRealtime_PerIPCap(t *testing.T) {
	h, _ := newConsumerRealtime(t)
	ip := "203.0.113.7"
	// Spread across many consumers so the per-consumer cap is never the reason.
	for i := 0; i < ConsumerRealtimeMaxPerIP; i++ {
		cid := "consumer-" + strconv.Itoa(i)
		if _, _, ok := h.admit(cid, ip); !ok {
			t.Fatalf("stream %d from one IP refused below the per-IP cap", i+1)
		}
	}
	if _, _, ok := h.admit("consumer-overflow", ip); ok {
		t.Fatalf("the per-IP cap did not refuse the extra stream")
	}
}

//  7. CONSUMER ISOLATION: consumer A's stream never carries consumer B's balance
//     or activity, even as B's canonical state changes underneath.
func TestConsumerRealtime_ConsumerIsolation(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.set("consumer-A", 100000, "act-A1")
	fr.set("consumer-B", 999999, "act-B1")

	srv := httptest.NewServer(authInjector("consumer-A", time.Time{}, h.Realtime))
	defer srv.Close()

	// While A watches, B's balance and activity change repeatedly.
	go func() {
		for i := 0; i < 5; i++ {
			time.Sleep(30 * time.Millisecond)
			fr.set("consumer-B", int64(1000000+i), "act-B"+strconv.Itoa(i+2))
		}
		// Finally, A itself changes so the stream produces a wallet.changed and
		// the reader can stop deterministically.
		time.Sleep(30 * time.Millisecond)
		fr.set("consumer-A", 150000, "act-A2")
	}()

	lines := streamRead(t, srv.URL, "/v1/me/realtime",
		func(ls []string) bool {
			return strings.Contains(strings.Join(ls, "\n"), `"available_minor":150000`)
		})
	joined := strings.Join(lines, "\n")

	// A must never see B's numbers or markers.
	for _, leaked := range []string{"999999", "1000000", "1000001", "act-B1", "act-B2", "consumer-B"} {
		if strings.Contains(joined, leaked) {
			t.Fatalf("consumer A's stream leaked consumer B's data %q: %s", leaked, joined)
		}
	}
	// A only ever sees its own values.
	if !strings.Contains(joined, `"available_minor":100000`) {
		t.Fatalf("A's snapshot missing its own balance: %s", joined)
	}
	if !strings.Contains(joined, `"available_minor":150000`) {
		t.Fatalf("A's change event missing its own new balance: %s", joined)
	}
}

// 8. A consumer without a wallet yet still gets a valid zero snapshot.
func TestConsumerRealtime_NoWalletYet(t *testing.T) {
	h, fr := newConsumerRealtime(t)
	fr.mu.Lock()
	fr.noWallet["consumer-new"] = true
	fr.mu.Unlock()

	w := httptest.NewRecorder()
	h.Realtime(w, realtimeReq(http.MethodGet, "/v1/me/realtime", "consumer-new", time.Time{}))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body)
	}
	var snap walletSnapshot
	_ = json.NewDecoder(w.Body).Decode(&snap)
	if snap.AvailableMinor != 0 {
		t.Errorf("a consumer with no wallet should read 0, got %d", snap.AvailableMinor)
	}
}

//  10. No write verb exists under /v1/me/realtime: it is a read-only notification
//     channel with no mutation authority.
func TestConsumerRealtime_NoWriteVerb(t *testing.T) {
	h, _ := newConsumerRealtime(t)
	r := chi.NewRouter()
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusMethodNotAllowed) })
	r.Get("/v1/me/realtime", h.Realtime)

	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		req := httptest.NewRequest(m, "/v1/me/realtime", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s answered %d — the realtime route must have no write method", m, rec.Code)
		}
	}
}

// 9. Heartbeat is fast enough that an abandoned stream frees its place promptly.
func TestConsumerRealtime_HeartbeatBoundsAbandonedStream(t *testing.T) {
	if ConsumerRealtimeHeartbeat > 5*time.Second {
		t.Fatalf("heartbeat %s: an abandoned stream would hold a place that long behind a proxy", ConsumerRealtimeHeartbeat)
	}
	if ConsumerRealtimePollInterval < time.Second {
		t.Fatalf("poll interval %s adds load without meeting a stricter target than the milestone's", ConsumerRealtimePollInterval)
	}
}
