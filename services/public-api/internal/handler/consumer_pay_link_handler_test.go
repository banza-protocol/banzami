package handler

// Integration tests for consumer pay link endpoints — PAYMENT-REQUEST-002.
//
// Security and correctness scenarios covered:
//  1.  GET /v1/consumer-pay-links/:code — public, no auth required → 200
//  2.  GET /v1/consumer-pay-links/:code — unknown code → 404 NOT_FOUND
//  3.  POST /v1/consumer-pay-links — authenticated create → 201
//  4.  POST /v1/consumer-pay-links — unauthenticated → 401 UNAUTHORIZED
//  5.  POST /v1/consumer-pay-links/:code/pay — unauthenticated → 401 UNAUTHORIZED
//  6.  POST /v1/consumer-pay-links/:code/pay — unknown code → 404 NOT_FOUND
//  7.  POST /v1/consumer-pay-links/:code/pay — already PAID → 422 LINK_NOT_ACTIVE
//  8.  POST /v1/consumer-pay-links/:code/pay — EXPIRED → 422 LINK_NOT_ACTIVE
//  9.  POST /v1/consumer-pay-links/:code/pay — CANCELLED → 422 LINK_NOT_ACTIVE
// 10.  POST /v1/consumer-pay-links/:code/pay — insufficient funds → 422 INSUFFICIENT_FUNDS
// 11.  POST /v1/consumer-pay-links/:code/pay — locked amount tamper ignored by backend → amount
//      in response reflects server-authoritative value, not client-supplied tampered value
// 12.  POST /v1/consumer-pay-links/:code/pay — idempotency: same key returns same result
// 13.  POST /v1/consumer-pay-links/:code/pay — response never exposes internal ledger IDs
// 14.  POST /v1/consumer-pay-links/:code/pay — happy path locked → 200 + correct fields

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// ---------------------------------------------------------------------------
// Fake
// ---------------------------------------------------------------------------

type fakePayLinkExecutor struct {
	getByCodeFn func(ctx context.Context, code string) (*service.ConsumerPayLink, error)
	createFn    func(ctx context.Context, req service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
	payFn       func(ctx context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error)
}

func (f *fakePayLinkExecutor) GetConsumerPayLinkByCode(ctx context.Context, code string) (*service.ConsumerPayLink, error) {
	if f.getByCodeFn != nil {
		return f.getByCodeFn(ctx, code)
	}
	return nil, service.ErrConsumerPayLinkNotFound
}

func (f *fakePayLinkExecutor) CreateConsumerPayLink(ctx context.Context, req service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
	if f.createFn != nil {
		return f.createFn(ctx, req)
	}
	return nil, service.ErrConsumerPayLinkNotFound
}

func (f *fakePayLinkExecutor) PayConsumerPayLink(ctx context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
	if f.payFn != nil {
		return f.payFn(ctx, code, req)
	}
	return nil, service.ErrConsumerPayLinkNotFound
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func buildPayLinkHandler(exec *fakePayLinkExecutor) *ConsumerPayLinkHandler {
	return newConsumerPayLinkHandlerWithFakes(exec)
}

func payLinkJsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return bytes.NewBuffer(b)
}

func payLinkDecodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.NewDecoder(w.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return out
}

func withAuth(r *http.Request, consumerID string) *http.Request {
	ctx := middleware.InjectConsumer(r.Context(), &middleware.Consumer{ID: consumerID})
	return r.WithContext(ctx)
}

// withChiParam injects a chi URL parameter so that chi.URLParam(r, key) works
// in handler unit tests that call handlers directly (no real chi router).
func withChiParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// canonicalActiveLink returns a fully-populated ACTIVE pay link for use in fakes.
func canonicalActiveLink(amountMinor int64, locked bool) *service.ConsumerPayLink {
	code := "TESTCODE1"
	n := "jantar do aniversário"
	dn := "João Silva"
	amt := amountMinor
	return &service.ConsumerPayLink{
		ID:                  "link-uuid-001",
		LinkCode:            code,
		ReceiverConsumerID:  "receiver-uuid-001",
		ReceiverHandle:      "joao",
		ReceiverDisplayName: &dn,
		AmountMinor:         &amt,
		Note:                &n,
		Currency:            "AOA",
		Locked:              locked,
		Status:              "ACTIVE",
		CreatedAt:           time.Now().UTC(),
	}
}

func paidLink(amountMinor int64) *service.ConsumerPayLink {
	l := canonicalActiveLink(amountMinor, true)
	l.Status = "PAID"
	payer := "payer-uuid-001"
	tid := "transfer-uuid-001"
	now := time.Now().UTC()
	l.PayerConsumerID = &payer
	l.TransferID = &tid
	l.PaidAt = &now
	return l
}

// ---------------------------------------------------------------------------
// 1. GET by code — public, no auth → 200
// ---------------------------------------------------------------------------

func TestPayLink_GetByCode_Public(t *testing.T) {
	link := canonicalActiveLink(450_000, true)
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		getByCodeFn: func(_ context.Context, code string) (*service.ConsumerPayLink, error) {
			if code != "TESTCODE1" {
				t.Errorf("unexpected code %q", code)
			}
			return link, nil
		},
	})

	r := httptest.NewRequest(http.MethodGet, "/v1/consumer-pay-links/TESTCODE1", nil)
	r = withChiParam(r, "code", "TESTCODE1")
	// deliberately no auth — public endpoint
	w := httptest.NewRecorder()
	h.GetByCode(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["link_code"] != "TESTCODE1" {
		t.Errorf("link_code = %v, want TESTCODE1", got["link_code"])
	}
	if got["status"] != "ACTIVE" {
		t.Errorf("status = %v, want ACTIVE", got["status"])
	}
	if got["amount_minor"] != float64(450_000) {
		t.Errorf("amount_minor = %v, want 450000", got["amount_minor"])
	}
}

// ---------------------------------------------------------------------------
// 2. GET by code — unknown code → 404 NOT_FOUND
// ---------------------------------------------------------------------------

func TestPayLink_GetByCode_NotFound(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		getByCodeFn: func(_ context.Context, _ string) (*service.ConsumerPayLink, error) {
			return nil, service.ErrConsumerPayLinkNotFound
		},
	})

	r := httptest.NewRequest(http.MethodGet, "/v1/consumer-pay-links/DOESNOTEXIST", nil)
	w := httptest.NewRecorder()
	h.GetByCode(w, r)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "NOT_FOUND" {
		t.Errorf("code = %v, want NOT_FOUND", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 3. POST create — authenticated → 201
// ---------------------------------------------------------------------------

func TestPayLink_Create_Authenticated(t *testing.T) {
	link := canonicalActiveLink(450_000, true)
	var capturedReq service.CreateConsumerPayLinkRequest
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		createFn: func(_ context.Context, req service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			capturedReq = req
			return link, nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{
		"amount_minor":     450_000,
		"note":             "jantar do aniversário",
		"currency":         "AOA",
		"locked":           true,
		"expires_in_hours": 24,
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links", body)
	r.Header.Set("Content-Type", "application/json")
	r = withAuth(r, "receiver-uuid-001")
	w := httptest.NewRecorder()
	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d — body: %s", w.Code, w.Body.String())
	}

	// The receiver comes from JWT/session, never from the request body.
	if capturedReq.ReceiverConsumerID != "receiver-uuid-001" {
		t.Errorf("ReceiverConsumerID = %v, want receiver-uuid-001", capturedReq.ReceiverConsumerID)
	}
	if !capturedReq.Locked {
		t.Error("expected locked=true")
	}
}

// ---------------------------------------------------------------------------
// 4. POST create — unauthenticated → 401
// ---------------------------------------------------------------------------

func TestPayLink_Create_Unauthenticated(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		createFn: func(_ context.Context, _ service.CreateConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			t.Fatal("core must not be called for unauthenticated request")
			return nil, nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{"amount_minor": 450_000})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links", body)
	r.Header.Set("Content-Type", "application/json")
	// no auth
	w := httptest.NewRecorder()
	h.Create(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "UNAUTHORIZED" {
		t.Errorf("code = %v, want UNAUTHORIZED", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 5. POST pay — unauthenticated → 401
// ---------------------------------------------------------------------------

func TestPayLink_Pay_Unauthenticated(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			t.Fatal("core must not be called for unauthenticated request")
			return nil, nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{"amount_minor": 450_000})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r.Header.Set("Content-Type", "application/json")
	// no auth
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "UNAUTHORIZED" {
		t.Errorf("code = %v, want UNAUTHORIZED", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 6. POST pay — unknown code → 404 NOT_FOUND
// ---------------------------------------------------------------------------

func TestPayLink_Pay_NotFound(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			return nil, service.ErrConsumerPayLinkNotFound
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-notfound"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/DOESNOTEXIST/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "NOT_FOUND" {
		t.Errorf("code = %v, want NOT_FOUND", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 7. POST pay — already PAID → 422 LINK_NOT_ACTIVE
// ---------------------------------------------------------------------------

func TestPayLink_Pay_AlreadyPaid(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			return nil, service.ErrConsumerPayLinkNotActive
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-paid"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "LINK_NOT_ACTIVE" {
		t.Errorf("code = %v, want LINK_NOT_ACTIVE", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 8. POST pay — EXPIRED → 422 LINK_NOT_ACTIVE
// ---------------------------------------------------------------------------

func TestPayLink_Pay_Expired(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			// LINK_EXPIRED maps to ErrConsumerPayLinkNotActive (same surface error)
			return nil, service.ErrConsumerPayLinkNotActive
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-expired"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/EXPIRED1/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "LINK_NOT_ACTIVE" {
		t.Errorf("code = %v, want LINK_NOT_ACTIVE", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 9. POST pay — CANCELLED → 422 LINK_NOT_ACTIVE
// ---------------------------------------------------------------------------

func TestPayLink_Pay_Cancelled(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			return nil, service.ErrConsumerPayLinkNotActive
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-cancelled"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/CANCEL1/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "LINK_NOT_ACTIVE" {
		t.Errorf("code = %v, want LINK_NOT_ACTIVE", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 10. POST pay — insufficient funds → 422 INSUFFICIENT_FUNDS
// ---------------------------------------------------------------------------

func TestPayLink_Pay_InsufficientFunds(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			return nil, service.ErrTransferInsufficientFunds
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-insuf"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)
	if got["code"] != "INSUFFICIENT_FUNDS" {
		t.Errorf("code = %v, want INSUFFICIENT_FUNDS", got["code"])
	}
}

// ---------------------------------------------------------------------------
// 11. POST pay — locked amount tamper
//
// Security property: when a client sends amount_minor=100 for a locked link
// with amount_minor=450000, the backend (Rust) ignores the client value and
// always uses the stored amount. The handler must pass the client-supplied
// amount_minor through (it is the Rust layer that discards it for locked links)
// and must NOT modify the response amount.
//
// This test verifies:
//   a) The handler passes body.amount_minor to core without modification.
//   b) The response reflects the server-authoritative amount (450 000), not
//      the tampered client value (100).
// ---------------------------------------------------------------------------

func TestPayLink_Pay_LockedAmountTamperIgnoredByBackend(t *testing.T) {
	const lockedAmount = int64(450_000)
	const tamperedAmount = int64(100)

	var capturedReq service.PayConsumerPayLinkRequest

	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			capturedReq = req
			// Simulate Rust: ignores req.AmountMinor for locked links,
			// posts the stored amount, returns the link with the original amount.
			return paidLink(lockedAmount), nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{
		"amount_minor":    tamperedAmount,
		"idempotency_key": "key-tamper-001",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r.Header.Set("Content-Type", "application/json")
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	// Verify: the handler forwards the client-supplied amount to core.
	// Rust is responsible for ignoring it on locked links.
	if capturedReq.AmountMinor == nil || *capturedReq.AmountMinor != tamperedAmount {
		t.Errorf("handler must forward client amount_minor to core: got %v, want %d",
			capturedReq.AmountMinor, tamperedAmount)
	}
	// The payer ID must come from the JWT, never from the request body.
	if capturedReq.PayerConsumerID != "payer-uuid-001" {
		t.Errorf("PayerConsumerID = %v, must come from JWT not request body", capturedReq.PayerConsumerID)
	}

	got := payLinkDecodeBody(t, w)
	// Response amount_minor must reflect the server-authoritative value.
	if got["amount_minor"] != float64(lockedAmount) {
		t.Errorf("response amount_minor = %v, want %d (server-authoritative locked amount)",
			got["amount_minor"], lockedAmount)
	}
	if got["status"] != "PAID" {
		t.Errorf("status = %v, want PAID", got["status"])
	}
}

// ---------------------------------------------------------------------------
// 12. POST pay — idempotency: same key, same result
// ---------------------------------------------------------------------------

func TestPayLink_Pay_IdempotencyPassthrough(t *testing.T) {
	callCount := 0
	result := paidLink(450_000)

	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			callCount++
			if req.IdempotencyKey != "key-idem-001" {
				t.Errorf("unexpected idempotency_key: %q", req.IdempotencyKey)
			}
			return result, nil
		},
	})

	call := func() map[string]any {
		body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-idem-001"})
		r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
		r = withAuth(r, "payer-uuid-001")
		w := httptest.NewRecorder()
		h.Pay(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
		}
		return payLinkDecodeBody(t, w)
	}

	r1 := call()
	r2 := call()

	if r1["link_code"] != r2["link_code"] {
		t.Errorf("idempotent calls returned different link_code: %v vs %v",
			r1["link_code"], r2["link_code"])
	}
}

// ---------------------------------------------------------------------------
// 13. POST pay — response must not expose internal ledger IDs
// ---------------------------------------------------------------------------

func TestPayLink_Pay_NoInternalIDsInResponse(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, _ string, _ service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			return paidLink(450_000), nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{"idempotency_key": "key-noleak"})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r = withAuth(r, "payer-uuid-001")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	got := payLinkDecodeBody(t, w)

	forbidden := []string{
		"ledger_posting_id", "available_account_id", "reserved_account_id",
		"payer_wallet_id", "receiver_wallet_id",
	}
	for _, field := range forbidden {
		if _, exists := got[field]; exists {
			t.Errorf("internal field %q must not appear in public response", field)
		}
	}

	required := []string{"link_code", "status", "amount_minor", "currency",
		"receiver_handle", "created_at"}
	for _, field := range required {
		if _, exists := got[field]; !exists {
			t.Errorf("required field %q missing from response", field)
		}
	}
}

// ---------------------------------------------------------------------------
// 14. POST pay — happy path locked link → 200 + all fields correct
// ---------------------------------------------------------------------------

func TestPayLink_Pay_HappyPathLocked(t *testing.T) {
	h := buildPayLinkHandler(&fakePayLinkExecutor{
		payFn: func(_ context.Context, code string, req service.PayConsumerPayLinkRequest) (*service.ConsumerPayLink, error) {
			if code != "TESTCODE1" {
				t.Errorf("unexpected code %q", code)
			}
			if req.PayerConsumerID != "payer-uuid-001" {
				t.Errorf("payer_consumer_id = %q, must equal JWT consumer", req.PayerConsumerID)
			}
			return paidLink(450_000), nil
		},
	})

	body := payLinkJsonBody(t, map[string]any{
		"idempotency_key": "key-happy-001",
	})
	r := httptest.NewRequest(http.MethodPost, "/v1/consumer-pay-links/TESTCODE1/pay", body)
	r.Header.Set("Content-Type", "application/json")
	r = withAuth(r, "payer-uuid-001")
	r = withChiParam(r, "code", "TESTCODE1")
	w := httptest.NewRecorder()
	h.Pay(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}
	got := payLinkDecodeBody(t, w)

	checks := map[string]any{
		"link_code":       "TESTCODE1",
		"status":          "PAID",
		"amount_minor":    float64(450_000),
		"currency":        "AOA",
		"receiver_handle": "joao",
		"locked":          true,
	}
	for field, want := range checks {
		if got[field] != want {
			t.Errorf("%s = %v, want %v", field, got[field], want)
		}
	}
	if got["paid_at"] == nil {
		t.Error("paid_at must be set after successful payment")
	}
	if got["transfer_id"] == nil || got["transfer_id"] == "" {
		t.Error("transfer_id must be set after successful payment")
	}
}
