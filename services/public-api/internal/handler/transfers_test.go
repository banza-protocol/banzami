package handler

// Integration tests for POST /v1/transfers — P2P-002 public consumer transfer API.
//
// Scenarios covered:
//  1.  authenticated transfer succeeds → 201 + canonical receipt
//  2.  unauthenticated request rejected → 401 UNAUTHORIZED
//  3.  invalid recipient rejected → 400 INVALID_RECIPIENT
//  4.  recipient not found → 404 RECIPIENT_NOT_FOUND
//  5.  recipient unavailable (suspended/closed) → 422 RECIPIENT_UNAVAILABLE
//  6.  self-transfer rejected → 400 SELF_TRANSFER_NOT_ALLOWED
//  7.  insufficient funds → 422 INSUFFICIENT_FUNDS
//  8.  duplicate idempotency returns same transfer (idempotency pass-through)
//  9.  missing idempotency_key → 400 MISSING_FIELD
// 10.  rate limiting enforced → 429 RATE_LIMITED
// 11.  trace_id returned in response
// 12.  response never exposes internal financial identifiers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// fakeP2pSender implements p2pTransferSender for tests.
type fakeP2pSender struct {
	sendFn        func(ctx context.Context, req service.SendP2pTransferRequest) (*service.P2pTransferResponse, error)
	getTransferFn func(ctx context.Context, id string) (*service.Transfer, error)
	listFn        func(ctx context.Context, consumerID string, limit int, cursor string) (*service.TransferPage, error)
}

func (f *fakeP2pSender) SendP2pTransfer(ctx context.Context, req service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
	return f.sendFn(ctx, req)
}
func (f *fakeP2pSender) GetTransfer(ctx context.Context, id string) (*service.Transfer, error) {
	if f.getTransferFn != nil {
		return f.getTransferFn(ctx, id)
	}
	return nil, service.ErrTransferNotFound
}
func (f *fakeP2pSender) ListTransfers(ctx context.Context, consumerID string, limit int, cursor string) (*service.TransferPage, error) {
	if f.listFn != nil {
		return f.listFn(ctx, consumerID, limit, cursor)
	}
	return &service.TransferPage{}, nil
}

// fakeHandleResolver implements senderHandleResolver for tests.
type fakeHandleResolver struct {
	handle string
	err    error
}

func (f *fakeHandleResolver) GetHandle(_ context.Context, _ string) (string, error) {
	return f.handle, f.err
}

// ---------------------------------------------------------------------------
// Test builder helpers
// ---------------------------------------------------------------------------

func buildHandler(t *testing.T, sender *fakeP2pSender, resolver *fakeHandleResolver, limiter *TransferRateLimiter) *TransferHandler {
	t.Helper()
	return newTransferHandlerWithFakes(sender, resolver, limiter)
}

func defaultLimiter() *TransferRateLimiter {
	return NewTransferRateLimiter(100, time.Minute) // generous limit for most tests
}

func strictLimiter(limit int) *TransferRateLimiter {
	return NewTransferRateLimiter(limit, time.Minute)
}

// requestWithAuth wraps an HTTP request with a fake authenticated consumer context.
// (In production this is set by the JWT middleware.)
func requestWithAuth(r *http.Request, consumerID string) *http.Request {
	// Add chi request ID so chimiddleware.GetReqID works in the handler.
	ctx := context.WithValue(r.Context(), chimiddleware.RequestIDKey, "test-trace-id-001")
	// Inject the consumer the same way the JWT auth middleware does.
	ctx = middleware.InjectConsumer(ctx, &middleware.Consumer{ID: consumerID})
	return r.WithContext(ctx)
}

func jsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return bytes.NewBuffer(b)
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.NewDecoder(w.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return out
}

func okResponse(status string, note *string) *service.P2pTransferResponse {
	n := "almoço"
	if note != nil {
		n = *note
	}
	return &service.P2pTransferResponse{
		ID:             "transfer-uuid-001",
		Sender:         "@joao",
		Recipient:      "@ana",
		AmountMinor:    200_000,
		Currency:       "AOA",
		Status:         "COMPLETED",
		Note:           &n,
		IdempotencyKey: "key-001",
		CreatedAt:      time.Now().UTC(),
	}
}

// ---------------------------------------------------------------------------
// 1. Authenticated transfer succeeds → 201 + canonical receipt
// ---------------------------------------------------------------------------

func TestSend_Success(t *testing.T) {
	resp := okResponse("COMPLETED", nil)
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return resp, nil
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ana",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"note":            "almoço",
		"idempotency_key": "key-001",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r.Header.Set("Content-Type", "application/json")
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — body: %s", w.Code, w.Body.String())
	}

	got := decodeBody(t, w)
	if got["transfer_id"] != "transfer-uuid-001" {
		t.Errorf("transfer_id = %v, want transfer-uuid-001", got["transfer_id"])
	}
	if got["sender"] != "@joao" {
		t.Errorf("sender = %v, want @joao", got["sender"])
	}
	if got["recipient"] != "@ana" {
		t.Errorf("recipient = %v, want @ana", got["recipient"])
	}
	if got["status"] != "COMPLETED" {
		t.Errorf("status = %v, want COMPLETED", got["status"])
	}
}

// ---------------------------------------------------------------------------
// 2. Unauthenticated request rejected → 401 UNAUTHORIZED
// ---------------------------------------------------------------------------

func TestSend_Unauthenticated(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			t.Fatal("core should not be called for unauthenticated request")
			return nil, nil
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ana",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-unauth",
	})
	// No auth context injected — consumer not in ctx.
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	got := decodeBody(t, w)
	if got["code"] != "UNAUTHORIZED" {
		t.Errorf("code = %v, want UNAUTHORIZED", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 3. Invalid recipient (bad handle format) → 400 INVALID_RECIPIENT
// ---------------------------------------------------------------------------

func TestSend_InvalidRecipient(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return nil, service.ErrInvalidHandle
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "BAD HANDLE!",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-badhandle",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "INVALID_RECIPIENT" {
		t.Errorf("code = %v, want INVALID_RECIPIENT", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 4. Recipient handle not found → 404 RECIPIENT_NOT_FOUND
// ---------------------------------------------------------------------------

func TestSend_RecipientNotFound(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return nil, service.ErrTransferRecipientNotFound
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ghost",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-ghost",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "RECIPIENT_NOT_FOUND" {
		t.Errorf("code = %v, want RECIPIENT_NOT_FOUND", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 5. Recipient unavailable (suspended/closed wallet) → 422 RECIPIENT_UNAVAILABLE
// ---------------------------------------------------------------------------

func TestSend_RecipientUnavailable(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return nil, service.ErrTransferRecipientUnavailable
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@suspended_user",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-suspended",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "RECIPIENT_UNAVAILABLE" {
		t.Errorf("code = %v, want RECIPIENT_UNAVAILABLE", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 6. Self-transfer → 400 SELF_TRANSFER_NOT_ALLOWED
// ---------------------------------------------------------------------------

func TestSend_SelfTransfer(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return nil, service.ErrTransferSelfTransfer
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@joao",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-self",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "SELF_TRANSFER_NOT_ALLOWED" {
		t.Errorf("code = %v, want SELF_TRANSFER_NOT_ALLOWED", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 7. Insufficient funds → 422 INSUFFICIENT_FUNDS
// ---------------------------------------------------------------------------

func TestSend_InsufficientFunds(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return nil, service.ErrTransferInsufficientFunds
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ana",
		"amount_minor":    999_999_999,
		"currency":        "AOA",
		"idempotency_key": "key-insuf",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "INSUFFICIENT_FUNDS" {
		t.Errorf("code = %v, want INSUFFICIENT_FUNDS", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 8. Duplicate idempotency key returns the original transfer (pass-through)
// ---------------------------------------------------------------------------

func TestSend_IdempotencyPassthrough(t *testing.T) {
	callCount := 0
	first := okResponse("COMPLETED", nil)
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			callCount++
			return first, nil // core engine returns same transfer on same key
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	payload := map[string]any{
		"recipient":       "@ana",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-idem",
	}

	call := func() map[string]any {
		body := jsonBody(t, payload)
		r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
		r = requestWithAuth(r, "consumer-uuid-joao")
		w := httptest.NewRecorder()
		h.Send(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", w.Code)
		}
		return decodeBody(t, w)
	}

	r1 := call()
	r2 := call()

	if r1["transfer_id"] != r2["transfer_id"] {
		t.Errorf("idempotent calls returned different transfer_id: %v vs %v",
			r1["transfer_id"], r2["transfer_id"])
	}
}

// ---------------------------------------------------------------------------
// 9. Missing idempotency_key → 400 MISSING_FIELD
// ---------------------------------------------------------------------------

func TestSend_MissingIdempotencyKey(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			t.Fatal("core should not be called when idempotency_key is missing")
			return nil, nil
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":    "@ana",
		"amount_minor": 200_000,
		"currency":     "AOA",
		// idempotency_key deliberately omitted
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["code"] != "MISSING_FIELD" {
		t.Errorf("code = %v, want MISSING_FIELD", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 10. Rate limiting enforced → 429 RATE_LIMITED
// ---------------------------------------------------------------------------

func TestSend_RateLimited(t *testing.T) {
	// Limiter allows only 1 transfer before blocking.
	limiter := strictLimiter(1)
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return okResponse("COMPLETED", nil), nil
		}},
		&fakeHandleResolver{handle: "joao"},
		limiter,
	)

	call := func() int {
		body := jsonBody(t, map[string]any{
			"recipient":       "@ana",
			"amount_minor":    200_000,
			"currency":        "AOA",
			"idempotency_key": "key-ratelimit",
		})
		r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
		r = requestWithAuth(r, "consumer-uuid-limited")
		w := httptest.NewRecorder()
		h.Send(w, r)
		return w.Code
	}

	if code := call(); code != http.StatusCreated {
		t.Fatalf("first call: expected 201, got %d", code)
	}
	if code := call(); code != http.StatusTooManyRequests {
		t.Fatalf("second call: expected 429, got %d", code)
	}
}

// ---------------------------------------------------------------------------
// 11. trace_id returned in successful response
// ---------------------------------------------------------------------------

func TestSend_TraceIDInResponse(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return okResponse("COMPLETED", nil), nil
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ana",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-trace",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao") // requestWithAuth injects trace ID
	r.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — body: %s", w.Code, w.Body.String())
	}
	got := decodeBody(t, w)
	if got["trace_id"] == nil || got["trace_id"] == "" {
		t.Errorf("trace_id missing from response: %v", got)
	}
}

// ---------------------------------------------------------------------------
// 12. Response never exposes internal financial identifiers
// ---------------------------------------------------------------------------

func TestSend_NoInternalIDsInResponse(t *testing.T) {
	h := buildHandler(t,
		&fakeP2pSender{sendFn: func(_ context.Context, _ service.SendP2pTransferRequest) (*service.P2pTransferResponse, error) {
			return okResponse("COMPLETED", nil), nil
		}},
		&fakeHandleResolver{handle: "joao"},
		defaultLimiter(),
	)

	body := jsonBody(t, map[string]any{
		"recipient":       "@ana",
		"amount_minor":    200_000,
		"currency":        "AOA",
		"idempotency_key": "key-noleak",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/transfers", body)
	r = requestWithAuth(r, "consumer-uuid-joao")

	w := httptest.NewRecorder()
	h.Send(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
	got := decodeBody(t, w)

	// Internal identifiers that must NOT appear in the public response.
	forbidden := []string{"sender_id", "recipient_id", "ledger_posting_id",
		"available_account_id", "reserved_account_id"}
	for _, field := range forbidden {
		if _, exists := got[field]; exists {
			t.Errorf("internal field %q must not appear in public response", field)
		}
	}

	// Public identifiers that MUST be present.
	required := []string{"transfer_id", "sender", "recipient", "amount_minor",
		"currency", "status", "created_at"}
	for _, field := range required {
		if _, exists := got[field]; !exists {
			t.Errorf("required field %q missing from public response", field)
		}
	}
}
