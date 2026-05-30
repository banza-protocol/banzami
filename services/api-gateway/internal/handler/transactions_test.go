package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

type mockTxSvc struct {
	createFn func(ctx context.Context, req service.CreateTransactionRequest) (*service.Transaction, error)
	getFn    func(ctx context.Context, merchantID, id string) (*service.Transaction, error)
	listFn   func(ctx context.Context, req service.ListTransactionsRequest) (*service.TransactionPage, error)
	// getFn ignores environment for test simplicity
}

func (m *mockTxSvc) Create(ctx context.Context, req service.CreateTransactionRequest) (*service.Transaction, error) {
	return m.createFn(ctx, req)
}

func (m *mockTxSvc) Get(ctx context.Context, merchantID, id, environment string) (*service.Transaction, error) {
	return m.getFn(ctx, merchantID, id)
}

func (m *mockTxSvc) List(ctx context.Context, req service.ListTransactionsRequest) (*service.TransactionPage, error) {
	return m.listFn(ctx, req)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func stubbedTx() *service.Transaction {
	return &service.Transaction{
		ID:             "tx-001",
		Status:         "pending",
		AmountMinor:    50000,
		Currency:       "AOA",
		MerchantID:     "merchant-001",
		IdempotencyKey: "idem-001",
		CreatedAt:      time.Now(),
	}
}

// withMerchant injects a merchant Principal into the request context, simulating
// a successfully authenticated request past the Auth middleware.
func withMerchant(r *http.Request, merchantID string) *http.Request {
	p := &middleware.Principal{MerchantID: merchantID}
	ctx := middleware.ContextWithPrincipal(r.Context(), p)
	return r.WithContext(ctx)
}

func jsonBody(v any) *bytes.Buffer {
	b, _ := json.Marshal(v)
	return bytes.NewBuffer(b)
}

func decodeError(t *testing.T, body *bytes.Buffer) apierror.Response {
	t.Helper()
	var e apierror.Response
	if err := json.NewDecoder(body).Decode(&e); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	return e
}

// ---------------------------------------------------------------------------
// Create tests
// ---------------------------------------------------------------------------

func TestTransactionCreate_NoMerchantPrincipal_Returns403(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"idempotency_key": "idem-001",
		"amount_minor":    50000,
		"currency":        "AOA",
	}))
	// No principal injected — simulates an unauthenticated request that bypassed middleware.
	h.Create(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
	e := decodeError(t, w.Body)
	if e.Code != "FORBIDDEN" {
		t.Errorf("expected code FORBIDDEN, got %s", e.Code)
	}
}

func TestTransactionCreate_MissingIdempotencyKey_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"amount_minor": 50000,
		"currency":     "AOA",
	})), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	e := decodeError(t, w.Body)
	if e.Code != "MISSING_FIELD" {
		t.Errorf("expected MISSING_FIELD, got %s", e.Code)
	}
}

func TestTransactionCreate_ZeroAmount_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"idempotency_key": "idem-001",
		"amount_minor":    0,
		"currency":        "AOA",
	})), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	e := decodeError(t, w.Body)
	if e.Code != "INVALID_AMOUNT" {
		t.Errorf("expected INVALID_AMOUNT, got %s", e.Code)
	}
}

func TestTransactionCreate_NegativeAmount_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"idempotency_key": "idem-001",
		"amount_minor":    -100,
		"currency":        "AOA",
	})), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestTransactionCreate_MissingCurrency_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"idempotency_key": "idem-001",
		"amount_minor":    50000,
	})), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	e := decodeError(t, w.Body)
	if e.Code != "MISSING_FIELD" {
		t.Errorf("expected MISSING_FIELD, got %s", e.Code)
	}
}

func TestTransactionCreate_ValidRequest_Returns201(t *testing.T) {
	svc := &mockTxSvc{
		createFn: func(_ context.Context, req service.CreateTransactionRequest) (*service.Transaction, error) {
			if req.MerchantID != "merchant-001" {
				t.Errorf("expected merchant-001, got %s", req.MerchantID)
			}
			if req.TransactionType != "payment" {
				t.Errorf("expected default type 'payment', got %s", req.TransactionType)
			}
			return stubbedTx(), nil
		},
	}
	h := handler.NewTransactionHandler(svc)
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions", jsonBody(map[string]any{
		"idempotency_key": "idem-001",
		"amount_minor":    50000,
		"currency":        "AOA",
	})), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d\nbody: %s", w.Code, w.Body.String())
	}
}

func TestTransactionCreate_InvalidJSON_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/transactions",
		bytes.NewBufferString("not json")), "merchant-001")
	h.Create(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// Get tests
// ---------------------------------------------------------------------------

func TestTransactionGet_NoMerchantPrincipal_Returns403(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "tx-001")
	r := httptest.NewRequest(http.MethodGet, "/v1/transactions/tx-001", nil)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	h.Get(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

func TestTransactionGet_NotFound_Returns404(t *testing.T) {
	svc := &mockTxSvc{
		getFn: func(_ context.Context, _, _ string) (*service.Transaction, error) {
			return nil, service.ErrTransactionNotFound
		},
	}
	h := handler.NewTransactionHandler(svc)

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "tx-missing")
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions/tx-missing", nil), "merchant-001")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	h.Get(w, r)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestTransactionGet_Success_Returns200(t *testing.T) {
	svc := &mockTxSvc{
		getFn: func(_ context.Context, _, _ string) (*service.Transaction, error) {
			return stubbedTx(), nil
		},
	}
	h := handler.NewTransactionHandler(svc)

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "tx-001")
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions/tx-001", nil), "merchant-001")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	h.Get(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// List tests
// ---------------------------------------------------------------------------

func TestTransactionList_InvalidLimit_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions?limit=999", nil), "merchant-001")
	h.List(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	e := decodeError(t, w.Body)
	if e.Code != "INVALID_PARAM" {
		t.Errorf("expected INVALID_PARAM, got %s", e.Code)
	}
}

func TestTransactionList_ZeroLimit_Returns400(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions?limit=0", nil), "merchant-001")
	h.List(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestTransactionList_DefaultLimit_Returns200(t *testing.T) {
	svc := &mockTxSvc{
		listFn: func(_ context.Context, req service.ListTransactionsRequest) (*service.TransactionPage, error) {
			if req.Limit != 20 {
				t.Errorf("expected default limit 20, got %d", req.Limit)
			}
			return &service.TransactionPage{Data: []*service.Transaction{stubbedTx()}}, nil
		},
	}
	h := handler.NewTransactionHandler(svc)
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions", nil), "merchant-001")
	h.List(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestTransactionList_NoMerchantPrincipal_Returns403(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{})
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/transactions", nil)
	h.List(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}
