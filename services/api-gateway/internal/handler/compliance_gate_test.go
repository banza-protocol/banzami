package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ---------------------------------------------------------------------------
// Mock services for the compliance gate
// ---------------------------------------------------------------------------

type mockPayoutSvc struct {
	createFn func(ctx context.Context, req service.CreatePayoutRequest) (*service.Payout, error)
}

func (m *mockPayoutSvc) Create(ctx context.Context, req service.CreatePayoutRequest) (*service.Payout, error) {
	return m.createFn(ctx, req)
}
func (m *mockPayoutSvc) Get(context.Context, string, string) (*service.Payout, error) {
	return nil, nil
}
func (m *mockPayoutSvc) List(context.Context, string, int) ([]*service.Payout, error) {
	return nil, nil
}

// mockCompliance lets each test control the authorize / merchant-status outcome.
type mockCompliance struct {
	authorizeFn    func(ctx context.Context, customerID, op string, amount, daily int64) (*service.Authorization, error)
	merchantStatFn func(ctx context.Context, merchantID string) (*service.MerchantComplianceStatus, error)
}

func (m *mockCompliance) VerifyCustomer(context.Context, string, json.RawMessage) (json.RawMessage, error) {
	return nil, nil
}
func (m *mockCompliance) VerifyMerchant(context.Context, string, json.RawMessage) (json.RawMessage, error) {
	return nil, nil
}
func (m *mockCompliance) GetCustomerStatus(context.Context, string) (json.RawMessage, error) {
	return nil, nil
}
func (m *mockCompliance) AuthorizeOperation(ctx context.Context, customerID, op string, amount, daily int64) (*service.Authorization, error) {
	return m.authorizeFn(ctx, customerID, op, amount, daily)
}
func (m *mockCompliance) GetMerchantStatus(ctx context.Context, merchantID string) (*service.MerchantComplianceStatus, error) {
	return m.merchantStatFn(ctx, merchantID)
}

func decodeRaw(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.NewDecoder(w.Body).Decode(&m); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return m
}

func sendBody() map[string]any {
	return map[string]any{
		"idempotency_key": "idem-1",
		"sender_id":       "cust-1",
		"recipient_id":    "cust-2",
		"amount_minor":    50000,
		"currency":        "AOA",
	}
}

// ---------------------------------------------------------------------------
// Transfer SEND gate — fail-closed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Payout KYB gate — fail-closed
// ---------------------------------------------------------------------------

func payoutBody() map[string]any {
	return map[string]any{
		"idempotency_key":     "idem-1",
		"wallet_id":           "wallet-1",
		"amount_minor":        100000,
		"currency":            "AOA",
		"bank_account_number": "0001234567",
		"bank_code":           "AO06",
		"account_holder_name": "ACME LDA",
	}
}

// When the compliance authority is unreachable, a payout must be refused with
// 503 COMPLIANCE_UNAVAILABLE rather than settling funds (fail-closed).
func TestPayoutCreate_ComplianceUnreachable_Returns503(t *testing.T) {
	comp := &mockCompliance{
		merchantStatFn: func(context.Context, string) (*service.MerchantComplianceStatus, error) {
			return nil, errors.New("core-api unreachable")
		},
	}
	svc := &mockPayoutSvc{createFn: func(context.Context, service.CreatePayoutRequest) (*service.Payout, error) {
		t.Fatal("Create must not be called when compliance is unreachable")
		return nil, nil
	}}
	h := handler.NewPayoutHandler(svc, comp)

	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payouts", jsonBody(payoutBody())), "merchant-1")
	h.Create(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	if code := decodeRaw(t, w)["code"]; code != "COMPLIANCE_UNAVAILABLE" {
		t.Errorf("expected COMPLIANCE_UNAVAILABLE, got %v", code)
	}
}

// When KYB is not approved, a payout is refused with 403 KYB_REQUIRED.
func TestPayoutCreate_KybNotApproved_Returns403(t *testing.T) {
	comp := &mockCompliance{
		merchantStatFn: func(context.Context, string) (*service.MerchantComplianceStatus, error) {
			return &service.MerchantComplianceStatus{KybStatus: "PENDING", AmlStatus: "APPROVED"}, nil
		},
	}
	svc := &mockPayoutSvc{createFn: func(context.Context, service.CreatePayoutRequest) (*service.Payout, error) {
		t.Fatal("Create must not be called when KYB is not approved")
		return nil, nil
	}}
	h := handler.NewPayoutHandler(svc, comp)

	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payouts", jsonBody(payoutBody())), "merchant-1")
	h.Create(w, r)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
	if code := decodeRaw(t, w)["code"]; code != "KYB_REQUIRED" {
		t.Errorf("expected KYB_REQUIRED, got %v", code)
	}
}

// When KYB + AML are approved, the payout proceeds to the payout service.
func TestPayoutCreate_KybApproved_Proceeds(t *testing.T) {
	comp := &mockCompliance{
		merchantStatFn: func(context.Context, string) (*service.MerchantComplianceStatus, error) {
			return &service.MerchantComplianceStatus{KybStatus: "APPROVED", AmlStatus: "APPROVED"}, nil
		},
	}
	called := false
	svc := &mockPayoutSvc{createFn: func(context.Context, service.CreatePayoutRequest) (*service.Payout, error) {
		called = true
		return &service.Payout{ID: "po-1"}, nil
	}}
	h := handler.NewPayoutHandler(svc, comp)

	w := httptest.NewRecorder()
	r := withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payouts", jsonBody(payoutBody())), "merchant-1")
	h.Create(w, r)

	if !called {
		t.Fatalf("expected payout service to be called; status=%d body=%s", w.Code, w.Body.String())
	}
}
