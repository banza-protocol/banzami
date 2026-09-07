package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(svc, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)

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
	h := handler.NewTransactionHandler(svc, nil)

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
	h := handler.NewTransactionHandler(svc, nil)

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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
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
	h := handler.NewTransactionHandler(svc, nil)
	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodGet, "/v1/transactions", nil), "merchant-001")
	h.List(w, r)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestTransactionList_NoMerchantPrincipal_Returns403(t *testing.T) {
	h := handler.NewTransactionHandler(&mockTxSvc{}, nil)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/transactions", nil)
	h.List(w, r)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

// The pricing selectors are gone from the transactions request.
//
// The comment that used to stand beside them said they were "reference only —
// never a price", and that a client cannot send a fee because there is no rate
// field. Both halves were true and the conclusion was wrong: the client picked
// the reference and the reference picks the price. It could even send
// pricing_profile, naming the operator's policy outright, and the documented
// "absent => unpriced => zero fee" made omitting everything the cheapest option.
//
// Asserted on the source, because a field that does not exist cannot be sent.
// stripComments removes // and /* */ so a check reads code rather than prose.
func stripComments(s string) string {
	var b strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if i := strings.Index(line, "//"); i >= 0 {
			line = line[:i]
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return b.String()
}

func TestTransactions_RequestCarriesNoPricingSelector(t *testing.T) {
	src, err := os.ReadFile("transactions.go")
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)

	start := strings.Index(body, "type createTransactionBody struct {")
	end := strings.Index(body[start:], "}")
	if start < 0 || end < 0 {
		t.Fatal("could not find the request struct")
	}
	// Comments stripped first. The struct now carries an explanation that names
	// the very fields it no longer has, and a check that cannot tell a record of
	// why from a live field would force the explanation to be deleted to stay
	// green — the same trap the SDK route guard hit.
	req := stripComments(body[start : start+end])
	for _, field := range []string{"business_category", "pricing_profile", "fee_policy_ref"} {
		if strings.Contains(req, field) {
			t.Errorf("the request still accepts %q — the caller can name the policy that prices it", field)
		}
	}
	// Whitespace-insensitive: gofmt aligns struct literals, so an exact-spacing
	// match asserts the formatter's choices rather than the code's meaning.
	flat := strings.Join(strings.Fields(body), " ")
	if !strings.Contains(flat, "PricingProfile: pricingProfile,") {
		t.Error("the transaction does not send the server-resolved pricing profile")
	}
	if strings.Contains(body, "body.BusinessCategory") || strings.Contains(body, "body.PricingProfile") {
		t.Error("the caller's pricing input still reaches the service")
	}
}
