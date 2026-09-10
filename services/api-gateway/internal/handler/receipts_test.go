package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	documents "github.com/banzami/banzami/services/common/documents"
)

type fakePayments struct {
	wp  *service.WalletPayment
	err error
}

func (f *fakePayments) GetByID(context.Context, string) (*service.WalletPayment, error) {
	return f.wp, f.err
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
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, gen: okGen(), receipts: &fakeIssuer{ref: "BZM-AAAA-1111"}}
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
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, gen: okGen(), receipts: &fakeIssuer{ref: "BZM-AAAA-1111"}}
	w, r := mkReq(t, "other-merchant", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestMerchantReceipt_WrongEnv404(t *testing.T) {
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, gen: okGen(), receipts: &fakeIssuer{ref: "BZM-AAAA-1111"}}
	w, r := mkReq(t, "m1", "SANDBOX") // payment is LIVE
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestMerchantReceipt_NotFound404(t *testing.T) {
	h := &ReceiptHandler{payments: &fakePayments{err: service.ErrWalletPaymentNotFound}, gen: okGen(), receipts: &fakeIssuer{ref: "BZM-AAAA-1111"}}
	w, r := mkReq(t, "m1", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

// The PDF prints the canonical receipt: the Business's copy of a payment,
// the payee the proof names, no second lookup of its own.
func TestMerchantReceipt_RendersTheCanonicalReceipt(t *testing.T) {
	var got documents.ReceiptData
	h := &ReceiptHandler{payments: &fakePayments{wp: sampleWP()}, receipts: &fakeIssuer{ref: "BZM-AAAA-1111"},
		gen: func(_ context.Context, d documents.ReceiptData) ([]byte, error) { got = d; return []byte("%PDF"), nil }}
	w, r := mkReq(t, "m1", "LIVE")
	h.MerchantReceipt(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	if got.Perspective != documents.PerspectiveMerchant || got.RecipientHandle != "mercadocentral" ||
		got.OperationKind != documents.OperationPayment || got.Reference != "BZM-AAAA-1111" {
		t.Fatalf("rendered %+v", got)
	}
}

// fakeIssuer stands in for the receipt derivation so both outcomes are reachable.
type fakeIssuer struct {
	ref string
	err error
}

func (f *fakeIssuer) WalletPaymentReceipt(context.Context, string, bool) (documents.Receipt, error) {
	if f.err != nil {
		return documents.Receipt{}, f.err
	}
	return documents.Receipt{
		ProofReference: f.ref, OperationKind: documents.OperationPayment, Channel: documents.ChannelQR,
		Payer:       documents.Party{Kind: documents.PartyPerson, DisplayName: "João Manuel", Handle: "joaomanuel"},
		Payee:       documents.Party{Kind: documents.PartyBusiness, DisplayName: "Mercado Central, Lda.", Handle: "mercadocentral"},
		AmountMinor: 2500000, Currency: "AOA", Status: "CONFIRMED", Environment: "LIVE",
	}, nil
}
