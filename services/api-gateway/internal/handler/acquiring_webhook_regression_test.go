package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Regression: the PAYER-side confirmation paths must emit payment_link.paid.
//
// The dispatch used to live inline in the merchant-facing MarkUsed handler and
// nowhere else. Both payer paths — the real provider callback and the Sandbox
// confirm rail — mark the link used on the PaymentLinkService directly, so
// neither produced an event. The result was the exact inversion of what an
// integration needs: a merchant declaring their own link used notified them,
// while an actual customer payment notified nobody. A donation app waiting on
// "your customer paid" would have waited forever.
//
// These tests pin the behaviour at both payer entry points.

type fakeAcquiring struct{ linkID string }

func (f *fakeAcquiring) InitiatePay(context.Context, string, int64, string) (*service.AcquiringPayment, error) {
	return &service.AcquiringPayment{ID: "ap-1", PaymentLinkID: f.linkID, ExternalRef: "ref-1", Status: "PENDING", AmountMinor: 250000, Currency: "AOA"}, nil
}
func (f *fakeAcquiring) ProcessCallback(context.Context, []byte, string) (*service.AcquiringPayment, error) {
	return &service.AcquiringPayment{ID: "ap-1", PaymentLinkID: f.linkID, ExternalRef: "ref-1", Status: "CONFIRMED", AmountMinor: 250000, Currency: "AOA"}, nil
}
func (f *fakeAcquiring) TestConfirm(context.Context, string, string) (*service.AcquiringPayment, error) {
	return &service.AcquiringPayment{ID: "ap-1", PaymentLinkID: f.linkID, ExternalRef: "ref-1", Status: "CONFIRMED", AmountMinor: 250000, Currency: "AOA"}, nil
}

func acquiringHandlerForTest() (*AcquiringHandler, *capturingWebhook) {
	cw := &capturingWebhook{StubWebhookService: service.NewStubWebhookService()}
	links := &fakeLinks{merchant: "m-owner"}
	return NewAcquiringHandler(&fakeAcquiring{linkID: "pl-1"}, links, nil, cw), cw
}

// awaitDispatch waits briefly for the fire-and-forget dispatch goroutine.
func awaitDispatch(t *testing.T, cw *capturingWebhook) (string, json.RawMessage) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if typ, payload := cw.captured(); typ != "" {
			return typ, payload
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cw.captured()
}

func routeWithSlug(h http.HandlerFunc, method, path string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Method(method, "/public/pay/{slug}/x", h)
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestTestConfirm_DispatchesPaymentLinkPaid(t *testing.T) {
	h, cw := acquiringHandlerForTest()
	rec := routeWithSlug(h.TestConfirm, http.MethodPost, "/public/pay/abc123/x?ref=ref-1")
	if rec.Code != http.StatusOK {
		t.Fatalf("test-confirm status = %d, want 200", rec.Code)
	}
	typ, payload := awaitDispatch(t, cw)
	if typ != "payment_link.paid" {
		t.Fatalf("event type = %q, want payment_link.paid — a Sandbox payment that emits nothing lets an integration pass here and go silent in Live", typ)
	}
	if len(payload) == 0 {
		t.Fatal("dispatched payload is empty")
	}
}

func TestEmisCallback_DispatchesPaymentLinkPaid(t *testing.T) {
	h, cw := acquiringHandlerForTest()
	req := httptest.NewRequest(http.MethodPost, "/v1/callbacks/emis", http.NoBody)
	rec := httptest.NewRecorder()
	h.EmisCallback(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("callback status = %d, want 200", rec.Code)
	}
	typ, _ := awaitDispatch(t, cw)
	if typ != "payment_link.paid" {
		t.Fatalf("event type = %q, want payment_link.paid — the real provider path must notify the merchant", typ)
	}
}

// A nil webhook service must not panic the payment path: delivery is
// best-effort, the payment is not.
func TestPayerPaths_SurviveNilWebhookService(t *testing.T) {
	h := NewAcquiringHandler(&fakeAcquiring{linkID: "pl-1"}, &fakeLinks{merchant: "m-owner"}, nil, nil)
	rec := routeWithSlug(h.TestConfirm, http.MethodPost, "/public/pay/abc123/x?ref=ref-1")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — webhook wiring must never break settlement", rec.Code)
	}
}
