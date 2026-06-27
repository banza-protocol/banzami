package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakePayments struct {
	wp  *service.WalletPayment
	err error
}

func (f *fakePayments) GetByID(context.Context, string) (*service.WalletPayment, error) {
	return f.wp, f.err
}

type fakeConsumers struct{ rec *service.ConsumerRecord }

func (f *fakeConsumers) Get(context.Context, string) (*service.ConsumerRecord, error) {
	return f.rec, nil
}

type fakeMerchants struct{ rec *service.MerchantRecord }

func (f *fakeMerchants) Get(context.Context, string) (*service.MerchantRecord, error) {
	return f.rec, nil
}

func sampleWP() *service.WalletPayment {
	return &service.WalletPayment{
		ID: "aaaa1111-2222-3333-4444-555566667777", TransferID: "tf-1",
		MerchantID: "m1", ConsumerID: "c1", AmountMinor: 2500000, Currency: "AOA",
		Status: "COMPLETED", Environment: "LIVE", CreatedAt: time.Date(2026, 6, 27, 14, 32, 0, 0, time.UTC),
	}
}

func sampleConsumer() *service.ConsumerRecord {
	n := "João Manuel"
	return &service.ConsumerRecord{ID: "c1", Handle: "joaomanuel", DisplayName: &n}
}
func sampleMerchant() *service.MerchantRecord {
	return &service.MerchantRecord{ID: "m1", Name: "Mercado Central, Lda."}
}

func mkReq(t *testing.T, merchantID, env string) (*httptest.ResponseRecorder, *http.Request) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/transactions/x/receipt.pdf", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "aaaa1111-2222-3333-4444-555566667777")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = middleware.ContextWithPrincipal(ctx, &middleware.Principal{MerchantID: merchantID, Environment: env})
	return httptest.NewRecorder(), req.WithContext(ctx)
}

func okGen() pdfGenerator {
	return func(context.Context, documents.ReceiptData) ([]byte, error) { return []byte("%PDF-1.4 stub"), nil }
}

func TestMerchantReceipt_OwnerOK(t *testing.T) {
	h := &ReceiptHandler{
		payments: &fakePayments{wp: sampleWP()}, consumers: &fakeConsumers{rec: sampleConsumer()},
		merchants: &fakeMerchants{rec: sampleMerchant()}, gen: okGen(),
	}
	w, r := mkReq(t, "m1", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if w.Header().Get("Content-Type") != "application/pdf" {
		t.Errorf("content-type = %q", w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Header().Get("Content-Disposition"), "banzami-comprovativo-BZM-AAAA-1111.pdf") {
		t.Errorf("disposition = %q", w.Header().Get("Content-Disposition"))
	}
}

func TestMerchantReceipt_OtherMerchant404(t *testing.T) {
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, consumers: &fakeConsumers{rec: sampleConsumer()}, merchants: &fakeMerchants{rec: sampleMerchant()}, gen: okGen()}
	w, r := mkReq(t, "other-merchant", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestMerchantReceipt_WrongEnv404(t *testing.T) {
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, consumers: &fakeConsumers{rec: sampleConsumer()}, merchants: &fakeMerchants{rec: sampleMerchant()}, gen: okGen()}
	w, r := mkReq(t, "m1", "SANDBOX") // payment is LIVE
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestMerchantReceipt_NotFound404(t *testing.T) {
	h := &ReceiptHandler{payments: &fakePayments{err: service.ErrWalletPaymentNotFound}, consumers: &fakeConsumers{}, merchants: &fakeMerchants{}, gen: okGen()}
	w, r := mkReq(t, "m1", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestBuildMerchantReceipt(t *testing.T) {
	d := buildMerchantReceipt(sampleWP(), sampleConsumer(), sampleMerchant())
	if d.Perspective != documents.PerspectiveMerchant {
		t.Error("wrong perspective")
	}
	if d.PayerHandle != "joaomanuel" || d.PayerName != "João Manuel" {
		t.Errorf("payer = %q/%q", d.PayerName, d.PayerHandle)
	}
	if d.MerchantName != "Mercado Central, Lda." {
		t.Errorf("merchant = %q", d.MerchantName)
	}
	if d.AmountMinor != 2500000 {
		t.Errorf("amount = %d", d.AmountMinor)
	}
	html, _ := documents.RenderHTML(d)
	if !strings.Contains(html, "Comprovativo de pagamento recebido") {
		t.Error("merchant perspective label missing")
	}
	for _, bad := range []string{"API Key", "PIN", "Bearer ", "token="} {
		if strings.Contains(html, bad) {
			t.Errorf("receipt contains %q", bad)
		}
	}
}
