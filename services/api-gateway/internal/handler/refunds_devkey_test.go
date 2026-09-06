package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// devRefunds records the merchant the handler decided on, which is the whole
// point: the value Core will be asked to authorise against.
type devRefunds struct{ sawMerchant string }

func (f *devRefunds) Create(_ context.Context, req service.CreateRefundRequest) (*service.Refund, error) {
	f.sawMerchant = req.MerchantID
	return &service.Refund{ID: "rf_1"}, nil
}
func (f *devRefunds) Get(_ context.Context, _, merchantID string) (*service.Refund, error) {
	f.sawMerchant = merchantID
	return &service.Refund{ID: "rf_1"}, nil
}
func (f *devRefunds) List(_ context.Context, _, merchantID string, _ int) (*service.RefundPage, error) {
	f.sawMerchant = merchantID
	return &service.RefundPage{}, nil
}

// Refunds under a developer credential.
//
// A refund is a financial write that moves money back out of the merchant. The
// property these pin is that knowing a payment id is not authority over it: the
// merchant is never read from the request, only from the project binding, and a
// read scope never authorises the write.
//
// Core independently re-checks that the source belongs to that merchant and is
// eligible, so these guard the gateway's half of a two-layer control rather than
// the only layer.

func devRefundReq(method, target, body string, scopes ...string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), boundDevPrincipal(scopes...)))
}

const refundBody = `{"source_type":"WALLET_PAYMENT","source_id":"wp_1","amount_minor":1000,"currency":"AOA","idempotency_key":"idem-1"}`

func TestDevKeyRefund_RequiresItsOwnWriteScope(t *testing.T) {
	h := NewRefundHandler(&devRefunds{})

	// A payment scope must not carry a refund with it: being able to take money
	// is not being able to give it back.
	rec := httptest.NewRecorder()
	h.Create(rec, devRefundReq("POST", "https://x/v1/refunds", refundBody, "payment_sessions:write"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("payment scope alone: want 403, got %d", rec.Code)
	}

	// Nor may the read scope.
	rec = httptest.NewRecorder()
	h.Create(rec, devRefundReq("POST", "https://x/v1/refunds", refundBody, "refunds:read"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("refunds:read on create: want 403, got %d", rec.Code)
	}

	// And settlement — the other money-out capability — is not a refund either.
	rec = httptest.NewRecorder()
	h.Create(rec, devRefundReq("POST", "https://x/v1/refunds", refundBody, "application_settlements:write"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("settlement scope on refund: want 403, got %d", rec.Code)
	}
}

func TestDevKeyRefund_ReadRoutesRequireTheReadScope(t *testing.T) {
	h := NewRefundHandler(&devRefunds{})

	rec := httptest.NewRecorder()
	h.List(rec, devRefundReq("GET", "https://x/v1/refunds", "", "payment_sessions:read"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("list with an unrelated scope: want 403, got %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	h.Get(rec, devRefundReq("GET", "https://x/v1/refunds/r_1", "", "payment_sessions:read"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("get with an unrelated scope: want 403, got %d", rec.Code)
	}
}

func TestDevKeyRefund_UnboundProjectCannotRefund(t *testing.T) {
	h := NewRefundHandler(&devRefunds{})
	dp := boundDevPrincipal("refunds:write")
	dp.Bound, dp.MerchantID = false, ""
	req := httptest.NewRequest("POST", "https://x/v1/refunds", strings.NewReader(refundBody))
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), dp))

	rec := httptest.NewRecorder()
	h.Create(rec, req)
	// Refunding requires a financial owner to refund FROM. An unbound project
	// has none, so this is a refusal rather than a not-found on the payment.
	if rec.Code != http.StatusForbidden {
		t.Fatalf("unbound project: want 403, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "PAYMENTS_UNAVAILABLE") {
		t.Errorf("want PAYMENTS_UNAVAILABLE, got %s", rec.Body.String())
	}
}

func TestDevKeyRefund_MerchantComesFromTheBindingNotTheBody(t *testing.T) {
	// There is deliberately no merchant_id field on this route. This proves that
	// smuggling one in changes nothing: the merchant handed to Core is the
	// binding's, not the caller's suggestion.
	f := &devRefunds{}
	h := NewRefundHandler(f)
	body := `{"merchant_id":"someone-else","source_type":"WALLET_PAYMENT","source_id":"wp_1",` +
		`"amount_minor":1000,"currency":"AOA","idempotency_key":"idem-2"}`

	rec := httptest.NewRecorder()
	h.Create(rec, devRefundReq("POST", "https://x/v1/refunds", body, "refunds:write"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if f.sawMerchant != "bound-merchant" {
		t.Fatalf("Core was asked to authorise against %q — must be the binding's merchant", f.sawMerchant)
	}
}

func TestDevKeyRefund_ReadsAreScopedToTheBoundMerchant(t *testing.T) {
	f := &devRefunds{}
	h := NewRefundHandler(f)

	rec := httptest.NewRecorder()
	h.Get(rec, withURLParam(devRefundReq("GET", "https://x/v1/refunds/rf_1", "", "refunds:read"), "id", "rf_1"))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	// A refund belonging to another merchant is filtered by Core using this
	// value; if it were the caller's to choose, the filter would be decorative.
	if f.sawMerchant != "bound-merchant" {
		t.Fatalf("read scoped to %q — must be the binding's merchant", f.sawMerchant)
	}
}
