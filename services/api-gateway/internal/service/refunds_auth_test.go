package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// The gateway→Core service credential (X-Internal-Key / CORE_INTERNAL_KEY) is an
// EXPLICIT opt-in scoped to the Refund service boundary only. It must ride
// refund create/get/list, and never leak onto any other Gateway→Core route
// group (least-privilege, minimal propagation surface).
func TestCoreInternalKey_OnlyOnRefundCalls(t *testing.T) {
	const key = "test-core-internal-key-9f3a"

	type seen struct{ path, keyHdr string }
	var mu sync.Mutex
	var reqs []seen

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		reqs = append(reqs, seen{r.URL.Path, r.Header.Get("X-Internal-Key")})
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`)) // decodes into Refund / RefundPage harmlessly
	}))
	defer srv.Close()

	client := NewCoreApiClient(srv.URL, key)
	refunds := NewCoreApiRefundService(client)
	ctx := context.Background()

	// Refund boundary — create/get/list MUST carry the key.
	if _, err := refunds.Create(ctx, CreateRefundRequest{
		CoreSourceType: "TRANSACTION", SourceID: "s", MerchantID: "m",
		AmountMinor: 100, Currency: "AOA", IdempotencyKey: "k",
	}); err != nil {
		t.Fatalf("refund create should succeed against the stub: %v", err)
	}
	if _, err := refunds.Get(ctx, "rid", "mid"); err != nil {
		t.Fatalf("refund get should succeed: %v", err)
	}
	if _, err := refunds.List(ctx, "", "mid", 20); err != nil {
		t.Fatalf("refund list should succeed: %v", err)
	}

	// Unrelated Core traffic — MUST NOT carry the key.
	var out map[string]any
	_ = client.get(ctx, "/internal/v1/transactions/abc", &out)
	_, _, _ = client.postRaw(ctx, "/internal/v1/wallets/x/transfer", map[string]any{"a": 1})
	_, _, _ = client.requestRaw(ctx, http.MethodPost, "/internal/v1/qr/pay", map[string]any{"a": 1})

	mu.Lock()
	defer mu.Unlock()

	sawRefund := false
	for _, s := range reqs {
		isRefund := strings.HasPrefix(s.path, "/internal/v1/refunds")
		if isRefund {
			sawRefund = true
			if s.keyHdr != key {
				t.Fatalf("refund call %s must carry X-Internal-Key, got %q", s.path, s.keyHdr)
			}
		} else if s.keyHdr != "" {
			t.Fatalf("non-refund call %s leaked X-Internal-Key (%q) — must be key-free", s.path, s.keyHdr)
		}
	}
	if !sawRefund {
		t.Fatal("expected at least one refund call to be observed")
	}
}

// When no key is configured, the refund calls simply omit the header (Core then
// fails closed) — the client never panics and never invents a value.
func TestCoreInternalKey_OmittedWhenUnset(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("X-Internal-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	refunds := NewCoreApiRefundService(NewCoreApiClient(srv.URL, "")) // no key
	_, _ = refunds.Get(context.Background(), "rid", "mid")
	if got != "" {
		t.Fatalf("with no configured key the header must be absent, got %q", got)
	}
}
