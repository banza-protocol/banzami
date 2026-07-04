package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// fakeLinks implements service.PaymentLinkService; Get/MarkUsed return a link
// owned by `merchant` and carrying an (optional) refund_source.
type fakeLinks struct {
	merchant string
	rs       *service.RefundSource
}

func (f *fakeLinks) link() *service.PaymentLink {
	slug := "abc123"
	return &service.PaymentLink{ID: "pl-1", Slug: slug, MerchantID: f.merchant, WalletID: "w1", Currency: "AOA", Status: "USED", RefundSource: f.rs}
}
func (f *fakeLinks) Create(context.Context, service.CreatePaymentLinkRequest) (*service.PaymentLink, error) { return f.link(), nil }
func (f *fakeLinks) Get(context.Context, string) (*service.PaymentLink, error)      { return f.link(), nil }
func (f *fakeLinks) GetBySlug(context.Context, string) (*service.PaymentLink, error) { return f.link(), nil }
func (f *fakeLinks) List(context.Context, service.ListPaymentLinksRequest) (*service.PaymentLinkListPage, error) {
	return &service.PaymentLinkListPage{Items: []*service.PaymentLink{f.link()}}, nil
}
func (f *fakeLinks) Cancel(context.Context, string) (*service.PaymentLink, error)   { return f.link(), nil }
func (f *fakeLinks) MarkUsed(context.Context, string) (*service.PaymentLink, error) { return f.link(), nil }

// capturingWebhook records the last dispatched payload.
type capturingWebhook struct {
	*service.StubWebhookService
	last json.RawMessage
	typ  string
}

func (c *capturingWebhook) Dispatch(ctx context.Context, req service.DispatchRequest) (*service.WebhookEvent, error) {
	c.last = req.Payload
	c.typ = req.EventType
	return c.StubWebhookService.Dispatch(ctx, req)
}

func linkHandler(rs *service.RefundSource) (*PaymentLinkHandler, *capturingWebhook) {
	cw := &capturingWebhook{StubWebhookService: service.NewStubWebhookService()}
	h := NewPaymentLinkHandler(&fakeLinks{merchant: "doa-merchant", rs: rs}, service.NewStubMerchantService(), cw)
	return h, cw
}

// WS1 item 2: the authenticated link GET exposes refund_source to the OWNER only.
func TestPaymentLink_RefundSourceOwnerOnly(t *testing.T) {
	rs := &service.RefundSource{SourceType: "WALLET_PAYMENT", SourceID: "wp-1"}

	// Owner sees it.
	h, _ := linkHandler(rs)
	r := chi.NewRouter()
	r.Get("/v1/payment-links/{id}", h.Get)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, reqWith("GET", "https://x/v1/payment-links/pl-1", "", "doa-merchant"))
	if !strings.Contains(rec.Body.String(), `"source_id":"wp-1"`) {
		t.Fatalf("owner must see refund_source: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "TRANSACTION") {
		t.Fatalf("must never leak TRANSACTION: %s", rec.Body.String())
	}

	// A DIFFERENT merchant must NOT see refund_source.
	h2, _ := linkHandler(rs)
	r2 := chi.NewRouter()
	r2.Get("/v1/payment-links/{id}", h2.Get)
	rec2 := httptest.NewRecorder()
	r2.ServeHTTP(rec2, reqWith("GET", "https://x/v1/payment-links/pl-1", "", "other-merchant"))
	if strings.Contains(rec2.Body.String(), "refund_source") {
		t.Fatalf("non-owner must NOT see refund_source: %s", rec2.Body.String())
	}
}

// WS1 item 4: payment_link.paid carries the same refund_source object.
func TestPaymentLink_PaidWebhookIncludesRefundSource(t *testing.T) {
	rs := &service.RefundSource{SourceType: "WALLET_PAYMENT", SourceID: "wp-77"}
	h, cw := linkHandler(rs)
	r := chi.NewRouter()
	r.Post("/v1/payment-links/{id}/mark-used", h.MarkUsed)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, reqWith("POST", "https://x/v1/payment-links/pl-1/mark-used", "", "doa-merchant"))
	if rec.Code != http.StatusOK {
		t.Fatalf("mark-used want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	// The dispatch is fire-and-forget in a goroutine; poll briefly.
	var payload map[string]any
	for i := 0; i < 50 && cw.last == nil; i++ {
		time.Sleep(10 * time.Millisecond)
	}
	if cw.typ != "payment_link.paid" {
		t.Fatalf("expected payment_link.paid, got %q", cw.typ)
	}
	if err := json.Unmarshal(cw.last, &payload); err != nil {
		t.Fatalf("bad payload: %v", err)
	}
	src, ok := payload["refund_source"].(map[string]any)
	if !ok {
		t.Fatalf("payment_link.paid must include refund_source: %s", string(cw.last))
	}
	if src["source_type"] != "WALLET_PAYMENT" || src["source_id"] != "wp-77" {
		t.Fatalf("refund_source = %+v, want WALLET_PAYMENT/wp-77", src)
	}
	if strings.Contains(string(cw.last), "TRANSACTION") {
		t.Fatalf("webhook must never leak TRANSACTION: %s", string(cw.last))
	}
}
