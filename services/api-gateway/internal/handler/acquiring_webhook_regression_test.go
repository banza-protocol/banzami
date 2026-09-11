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
func (f *fakeAcquiring) TestConfirm(context.Context, string, string, string) (*service.AcquiringPayment, error) {
	return &service.AcquiringPayment{ID: "ap-1", PaymentLinkID: f.linkID, ExternalRef: "ref-1", Status: "CONFIRMED", AmountMinor: 250000, Currency: "AOA"}, nil
}

func acquiringHandlerForTest() (*AcquiringHandler, *capturingWebhook) {
	cw := &capturingWebhook{StubWebhookService: service.NewStubWebhookService()}
	links := &fakeLinks{merchant: "m-owner"}
	// The payment belongs to the link the slug resolves to (fakeLinks).
	return NewAcquiringHandler(&fakeAcquiring{linkID: "11111111-1111-4111-8111-111111111111"}, links, nil, cw), cw
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

// Both payer paths leave the link and its event to core, which marks the link
// USED and writes payment_link.paid in the settlement's own transaction. A
// second dispatch here would deliver the event twice (A2-07).
func TestPayerPaths_LeaveTheLinkAndItsEventToCore(t *testing.T) {
	for name, call := range map[string]func(h *AcquiringHandler) int{
		"test-confirm": func(h *AcquiringHandler) int {
			return routeWithSlug(h.TestConfirm, http.MethodPost, "/public/pay/abc123/x?ref=ref-1").Code
		},
		"emis-callback": func(h *AcquiringHandler) int {
			rec := httptest.NewRecorder()
			h.EmisCallback(rec, httptest.NewRequest(http.MethodPost, "/v1/callbacks/emis", http.NoBody))
			return rec.Code
		},
	} {
		h, cw := acquiringHandlerForTest()
		if code := call(h); code != http.StatusOK {
			t.Fatalf("%s: status %d, want 200", name, code)
		}
		time.Sleep(150 * time.Millisecond)
		if typ, _ := cw.captured(); typ != "" {
			t.Fatalf("%s: the gateway dispatched %s itself — core already wrote it", name, typ)
		}
		if n := h.paymentLinks.(*fakeLinks).markUsedCalls; n != 0 {
			t.Fatalf("%s: the gateway marked the link used (%d) — core already did", name, n)
		}
	}
}

// A settlement core could not complete answers 5xx, so the provider retries.
// It answered 422 — "refused" — and the provider never tried again.
func TestEmisCallback_AnUnfinishedSettlementAsksForARetry(t *testing.T) {
	h := NewAcquiringHandler(&failingAcquiring{}, &fakeLinks{merchant: "m"}, nil, nil)
	rec := httptest.NewRecorder()
	h.EmisCallback(rec, httptest.NewRequest(http.MethodPost, "/v1/callbacks/emis", http.NoBody))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("an unfinished settlement answered %d, want 502", rec.Code)
	}
}

type failingAcquiring struct{ fakeAcquiring }

func (*failingAcquiring) ProcessCallback(context.Context, []byte, string) (*service.AcquiringPayment, error) {
	return nil, &service.CoreError{Status: http.StatusInternalServerError, Code: "INTERNAL", Message: "outbox unavailable"}
}

// A nil webhook service must not panic the payment path: delivery is
// best-effort, the payment is not.
func TestPayerPaths_SurviveNilWebhookService(t *testing.T) {
	h := NewAcquiringHandler(&fakeAcquiring{linkID: "11111111-1111-4111-8111-111111111111"}, &fakeLinks{merchant: "m-owner"}, nil, nil)
	rec := routeWithSlug(h.TestConfirm, http.MethodPost, "/public/pay/abc123/x?ref=ref-1")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — webhook wiring must never break settlement", rec.Code)
	}
}

// test-confirm confirms only the payment of the link in the URL. A reference
// from another link used to be confirmed, and THAT link marked paid.
func TestTestConfirm_RefusesAnotherLinksPayment(t *testing.T) {
	cw := &capturingWebhook{StubWebhookService: service.NewStubWebhookService()}
	h := NewAcquiringHandler(&fakeAcquiring{linkID: "22222222-2222-4222-8222-222222222222"}, &fakeLinks{merchant: "m-owner"}, nil, cw)
	rec := routeWithSlug(h.TestConfirm, http.MethodPost, "/public/pay/abc123/x?ref=ref-1")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("another link's payment: status %d, want 404", rec.Code)
	}
	time.Sleep(150 * time.Millisecond)
	if typ, _ := cw.captured(); typ != "" {
		t.Fatalf("%s was dispatched for another link's payment", typ)
	}
}
