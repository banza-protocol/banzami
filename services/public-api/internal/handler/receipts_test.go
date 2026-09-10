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

	documents "github.com/banzami/banzami/services/common/documents"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

type fakeReceiptCore struct {
	transfer *service.Transfer
	transErr error
}

func (f *fakeReceiptCore) GetTransfer(_ context.Context, _ string) (*service.Transfer, error) {
	if f.transErr != nil {
		return nil, f.transErr
	}
	return f.transfer, nil
}

func sampleTransfer() *service.Transfer {
	desc := "Café"
	return &service.Transfer{
		ID:          "11112222-3333-4444-5555-666677778888",
		SenderID:    "s1",
		RecipientID: "r1",
		Amount:      service.TransferMoney{AmountMinor: 2500000, Currency: "AOA"},
		Currency:    "AOA",
		Status:      "COMPLETED",
		Description: &desc,
		CreatedAt:   time.Date(2026, 6, 27, 14, 32, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2026, 6, 27, 14, 32, 5, 0, time.UTC),
	}
}

// sampleReceipt is a payment to a Business as the gateway derives it.
func sampleReceipt() documents.Receipt {
	at := time.Date(2026, 9, 10, 19, 13, 27, 0, time.UTC)
	return documents.Receipt{
		OperationKind: documents.OperationPayment, Channel: documents.ChannelPaymentLink,
		FundingSource: documents.FundingBanzamiBalance, Status: "CONFIRMED",
		AmountMinor: 200000, Currency: "AOA",
		Payer:       documents.Party{Kind: documents.PartyPerson, DisplayName: "João Manuel", Handle: "joaomanuel"},
		Payee:       documents.Party{Kind: documents.PartyBusiness, DisplayName: "Doa", Handle: "doa"},
		ConfirmedAt: &at, Environment: "SANDBOX", Network: "BANZA", Operator: "Banzami",
		TransactionID: "11112222-3333-4444-5555-666677778888",
	}
}

func newReq(t *testing.T, consumerID string) (*httptest.ResponseRecorder, *http.Request) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/consumer/transactions/tx/receipt.pdf", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "11112222-3333-4444-5555-666677778888")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = middleware.InjectConsumer(ctx, &middleware.Consumer{ID: consumerID})
	return httptest.NewRecorder(), req.WithContext(ctx)
}

func stubGen() pdfGenerator {
	return func(context.Context, documents.ReceiptData) ([]byte, error) { return []byte("%PDF-1.4 stub"), nil }
}

func TestConsumerReceipt_OwnerOK(t *testing.T) {
	for _, owner := range []string{"s1", "r1"} {
		// A receipt now requires an established public proof, so the happy path
		// must supply one. The filename below is that proof's reference.
		h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer()},
			gen: stubGen(), receipts: &fakeMinter{ref: "BZM-1111-2222"}, env: "SANDBOX"}
		w, r := newReq(t, owner)
		h.ConsumerReceipt(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("owner %s: status = %d, want 200", owner, w.Code)
		}
		if ct := w.Header().Get("Content-Type"); ct != "application/pdf" {
			t.Errorf("owner %s: content-type = %q", owner, ct)
		}
		if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "banzami-comprovativo-BZM-1111-2222.pdf") {
			t.Errorf("owner %s: disposition = %q", owner, cd)
		}
		if !strings.HasPrefix(w.Body.String(), "%PDF") {
			t.Errorf("owner %s: body not a pdf", owner)
		}
	}
}

func TestConsumerReceipt_NotOwner404(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer()}, gen: stubGen()}
	w, r := newReq(t, "intruder")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("non-owner: status = %d, want 404", w.Code)
	}
}

func TestConsumerReceipt_NotFound404(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transErr: service.ErrTransferNotFound}, gen: stubGen()}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("not-found: status = %d, want 404", w.Code)
	}
}

func TestConsumerReceipt_GenFailure503(t *testing.T) {
	failGen := pdfGenerator(func(context.Context, documents.ReceiptData) ([]byte, error) {
		return nil, context.DeadlineExceeded
	})
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer()}, gen: failGen, receipts: &fakeMinter{ref: "BZM-1111-2222"}}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("gen failure: status = %d, want 503", w.Code)
	}
}

// The PDF renders the canonical receipt the gateway returned — the payee the
// proof names, the proof's reference — and nothing public-api looked up.
func TestConsumerReceipt_RendersTheCanonicalReceipt(t *testing.T) {
	var got documents.ReceiptData
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer()}, receipts: &fakeMinter{ref: secureRef}, env: "SANDBOX",
		gen: func(_ context.Context, d documents.ReceiptData) ([]byte, error) { got = d; return []byte("%PDF"), nil }}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	if got.Reference != secureRef || got.RecipientName != "@doa" || got.RecipientHandle != "" ||
		got.OperationKind != documents.OperationPayment || got.Channel != documents.ChannelPaymentLink {
		t.Fatalf("rendered %+v", got)
	}
	html, _ := documents.RenderHTML(got)
	for _, bad := range []string{"API Key", "PIN", "Bearer ", "token=", "Payment link:"} {
		if strings.Contains(html, bad) {
			t.Errorf("receipt contains %q", bad)
		}
	}
}

// The JSON the app renders is the same receipt, with the same reference.
func TestConsumerReceiptJSON_IsTheSameReceipt(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer()}, receipts: &fakeMinter{ref: secureRef}, env: "SANDBOX", gen: stubGen()}
	w, r := newReq(t, "r1")
	h.ConsumerReceiptJSON(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	var rec documents.Receipt
	if err := json.Unmarshal(w.Body.Bytes(), &rec); err != nil {
		t.Fatal(err)
	}
	if rec.ProofReference != secureRef || rec.Payee.Handle != "doa" || rec.OperationKind != documents.OperationPayment {
		t.Fatalf("json receipt %+v", rec)
	}
	w2, r2 := newReq(t, "intruder")
	h.ConsumerReceiptJSON(w2, r2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("a non-party read the receipt: %d", w2.Code)
	}
}
