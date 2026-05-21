package banzami_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami-go/banzami"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newTestServer(t *testing.T, handler http.HandlerFunc) (*banzami.Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	client := banzami.NewClient(banzami.ClientOptions{
		APIKey:     "bz_live_testkey",
		BaseURL:    srv.URL,
		MaxRetries: 0,
		RetryDelay: 0,
	})
	return client, srv
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

func TestBearerAuthHeader(t *testing.T) {
	var captured string
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		captured = r.Header.Get("Authorization")
		respond(w, 200, map[string]any{
			"id": "tx_001", "merchant_id": "m_001", "amount_minor": float64(1000),
			"currency": "AOA", "status": "PENDING",
			"created_at": "2026-05-15T10:00:00Z", "updated_at": "2026-05-15T10:00:00Z",
		})
	})
	_, _ = client.Transactions.Get(context.Background(), "tx_001")
	if captured != "Bearer bz_live_testkey" {
		t.Fatalf("expected Bearer bz_live_testkey, got %q", captured)
	}
}

func TestUserAgentHeader(t *testing.T) {
	var ua string
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		ua = r.Header.Get("User-Agent")
		respond(w, 200, map[string]any{
			"id": "tx_001", "merchant_id": "m_001", "amount_minor": float64(1000),
			"currency": "AOA", "status": "PENDING",
			"created_at": "2026-05-15T10:00:00Z", "updated_at": "2026-05-15T10:00:00Z",
		})
	})
	_, _ = client.Transactions.Get(context.Background(), "tx_001")
	if !strings.HasPrefix(ua, "banzami-go/") {
		t.Fatalf("unexpected User-Agent: %q", ua)
	}
}

// ---------------------------------------------------------------------------
// IsSandbox
// ---------------------------------------------------------------------------

func TestIsSandbox(t *testing.T) {
	live := banzami.NewClient(banzami.ClientOptions{APIKey: "bz_live_abc"})
	if live.IsSandbox() {
		t.Fatal("live key should not be sandbox")
	}
	sandbox := banzami.NewClient(banzami.ClientOptions{APIKey: "bz_test_abc"})
	if !sandbox.IsSandbox() {
		t.Fatal("test key should be sandbox")
	}
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

func txFixture() map[string]any {
	return map[string]any{
		"id": "tx_001", "merchant_id": "m_001", "amount_minor": float64(25000),
		"currency": "AOA", "status": "COMPLETED",
		"created_at": "2026-05-15T10:00:00Z", "updated_at": "2026-05-15T10:01:00Z",
	}
}

func TestTransactionsGet(t *testing.T) {
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/transactions/tx_001" {
			t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
		}
		respond(w, 200, txFixture())
	})
	result, err := client.Transactions.Get(context.Background(), "tx_001")
	if err != nil {
		t.Fatal(err)
	}
	if result.ID != "tx_001" {
		t.Fatalf("unexpected ID: %s", result.ID)
	}
}

func TestTransactionsList(t *testing.T) {
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/transactions" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("limit") != "10" {
			t.Errorf("expected limit=10, got %q", r.URL.Query().Get("limit"))
		}
		respond(w, 200, map[string]any{"data": []any{txFixture()}, "next_cursor": nil})
	})
	result, err := client.Transactions.List(context.Background(), 10, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Data) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(result.Data))
	}
}

// ---------------------------------------------------------------------------
// Payment links
// ---------------------------------------------------------------------------

func linkFixture() map[string]any {
	return map[string]any{
		"id": "lnk_001", "slug": "abc123", "merchant_id": "m_001",
		"wallet_id": "wal_001", "currency": "AOA", "status": "ACTIVE",
		"created_at": "2026-05-15T10:00:00Z", "updated_at": "2026-05-15T10:00:00Z",
	}
}

func TestPaymentLinksCreate(t *testing.T) {
	var capturedBody map[string]any
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/payment-links" {
			t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		respond(w, 201, linkFixture())
	})
	result, err := client.PaymentLinks.Create(context.Background(), banzami.CreatePaymentLinkInput{
		MerchantID: "m_001",
		WalletID:   "wal_001",
		Currency:   "AOA",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.ID != "lnk_001" {
		t.Fatalf("unexpected ID: %s", result.ID)
	}
	if capturedBody["merchant_id"] != "m_001" {
		t.Errorf("expected merchant_id=m_001, got %v", capturedBody["merchant_id"])
	}
}

func TestPaymentLinksGet(t *testing.T) {
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, linkFixture())
	})
	result, err := client.PaymentLinks.Get(context.Background(), "lnk_001")
	if err != nil {
		t.Fatal(err)
	}
	if result.Slug != "abc123" {
		t.Fatalf("unexpected slug: %s", result.Slug)
	}
}

func TestPaymentLinksList(t *testing.T) {
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("merchant_id") != "m_001" {
			t.Errorf("expected merchant_id=m_001, got %q", r.URL.Query().Get("merchant_id"))
		}
		respond(w, 200, map[string]any{"data": []any{linkFixture()}, "next_cursor": nil})
	})
	result, err := client.PaymentLinks.List(context.Background(), "m_001", 10, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Data) != 1 {
		t.Fatalf("expected 1 link, got %d", len(result.Data))
	}
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

func TestPayoutsList(t *testing.T) {
	payout := map[string]any{
		"id": "pay_001", "wallet_id": "wal_001", "amount_minor": float64(100000),
		"currency": "AOA", "status": "PENDING",
		"created_at": time.Now().Format(time.RFC3339),
		"updated_at": time.Now().Format(time.RFC3339),
	}
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/payouts" {
			t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
		}
		respond(w, 200, map[string]any{"data": []any{payout}, "next_cursor": nil})
	})
	result, err := client.Payouts.List(context.Background(), 20, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Data) != 1 {
		t.Fatalf("expected 1 payout, got %d", len(result.Data))
	}
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

func TestAPIError404(t *testing.T) {
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		respond(w, 404, map[string]any{"code": "NOT_FOUND", "message": "not found"})
	})
	_, err := client.Transactions.Get(context.Background(), "missing")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	apiErr, ok := err.(*banzami.APIError)
	if !ok {
		t.Fatalf("expected *banzami.APIError, got %T", err)
	}
	if apiErr.Status != 404 {
		t.Errorf("expected status 404, got %d", apiErr.Status)
	}
	if apiErr.Code != "NOT_FOUND" {
		t.Errorf("expected code NOT_FOUND, got %s", apiErr.Code)
	}
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

func TestRetryOnce(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount < 2 {
			respond(w, 503, map[string]any{"code": "OVERLOAD", "message": "overload"})
			return
		}
		respond(w, 200, txFixture())
	}))
	defer srv.Close()

	client := banzami.NewClient(banzami.ClientOptions{
		APIKey:     "bz_live_test",
		BaseURL:    srv.URL,
		MaxRetries: 3,
		RetryDelay: 0,
	})
	_, err := client.Transactions.Get(context.Background(), "tx_001")
	if err != nil {
		t.Fatal(err)
	}
	if callCount != 2 {
		t.Fatalf("expected 2 calls (1 fail + 1 success), got %d", callCount)
	}
}

func TestNoRetryOn422(t *testing.T) {
	callCount := 0
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		respond(w, 422, map[string]any{"code": "INVALID_AMOUNT", "message": "bad"})
	})
	_, err := client.Transactions.Get(context.Background(), "bad")
	if err == nil {
		t.Fatal("expected error")
	}
	if callCount != 1 {
		t.Fatalf("expected exactly 1 call (no retry on 422), got %d", callCount)
	}
}

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

func TestIdempotencyKeySentOnPost(t *testing.T) {
	var capturedKey string
	client, _ := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		capturedKey = r.Header.Get("Idempotency-Key")
		respond(w, 201, linkFixture())
	})
	_, _ = client.PaymentLinks.Create(context.Background(), banzami.CreatePaymentLinkInput{
		MerchantID: "m_001",
		WalletID:   "wal_001",
		Currency:   "AOA",
	})
	if capturedKey == "" {
		t.Fatal("expected Idempotency-Key header to be set on POST")
	}
}
