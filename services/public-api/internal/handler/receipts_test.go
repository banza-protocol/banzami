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
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

type fakeReceiptCore struct {
	transfer  *service.Transfer
	transErr  error
	consumers map[string]*service.ConsumerRecord
}

func (f *fakeReceiptCore) GetTransfer(_ context.Context, _ string) (*service.Transfer, error) {
	if f.transErr != nil {
		return nil, f.transErr
	}
	return f.transfer, nil
}
func (f *fakeReceiptCore) GetConsumer(_ context.Context, id string) (*service.ConsumerRecord, error) {
	return f.consumers[id], nil
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

func sampleParties() map[string]*service.ConsumerRecord {
	jn := "João Manuel"
	mc := "Mercado Central, Lda."
	return map[string]*service.ConsumerRecord{
		"s1": {ID: "s1", Handle: "joaomanuel", DisplayName: &jn},
		"r1": {ID: "r1", Handle: "mercadocentral", DisplayName: &mc},
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
		h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()}, gen: stubGen()}
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
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()}, gen: stubGen()}
	w, r := newReq(t, "intruder")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("non-owner: status = %d, want 404", w.Code)
	}
}

func TestConsumerReceipt_NotFound404(t *testing.T) {
	h := &ReceiptHandler{core: &fakeReceiptCore{transErr: service.ErrTransferNotFound, consumers: sampleParties()}, gen: stubGen()}
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
	h := &ReceiptHandler{core: &fakeReceiptCore{transfer: sampleTransfer(), consumers: sampleParties()}, gen: failGen}
	w, r := newReq(t, "s1")
	h.ConsumerReceipt(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("gen failure: status = %d, want 503", w.Code)
	}
}

func TestBuildConsumerReceipt(t *testing.T) {
	p := sampleParties()
	d := buildConsumerReceipt(sampleTransfer(), p["s1"], p["r1"])
	if d.Perspective != documents.PerspectiveConsumer {
		t.Error("wrong perspective")
	}
	if d.Reference != "BZM-1111-2222" {
		t.Errorf("reference = %q", d.Reference)
	}
	if d.AmountMinor != 2500000 || d.Currency != "AOA" {
		t.Errorf("amount = %d %s", d.AmountMinor, d.Currency)
	}
	if d.PayerName != "João Manuel" || d.PayerHandle != "joaomanuel" {
		t.Errorf("payer = %q/%q", d.PayerName, d.PayerHandle)
	}
	if d.RecipientName != "Mercado Central, Lda." || d.RecipientHandle != "mercadocentral" {
		t.Errorf("recipient = %q/%q", d.RecipientName, d.RecipientHandle)
	}
	// rendered receipt must carry no secrets
	html, _ := documents.RenderHTML(d)
	for _, bad := range []string{"API Key", "PIN", "Bearer ", "token="} {
		if strings.Contains(html, bad) {
			t.Errorf("receipt contains %q", bad)
		}
	}
}
