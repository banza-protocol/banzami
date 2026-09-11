package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

type fakeAdminLister struct {
	items []service.AdminWalletPaymentItem
	next  string
}

func (f *fakeAdminLister) List(context.Context, service.AdminWalletPaymentFilter) ([]service.AdminWalletPaymentItem, string, error) {
	return f.items, f.next, nil
}

func TestAdminWalletPaymentsList_Mapped(t *testing.T) {
	fl := &fakeAdminLister{
		items: []service.AdminWalletPaymentItem{{
			ID: "aaaa1111-2222-3333-4444-555566667777", MerchantID: "m1", MerchantName: "Mercado Central, Lda.",
			PayeeHandle: "mercado", PayeeDisplayName: "Mercado Central",
			PayerName: "João Manuel", AmountMinor: 2500000, Currency: "AOA", Status: "COMPLETED",
			Environment: "LIVE", CreatedAt: time.Date(2026, 6, 27, 14, 32, 0, 0, time.UTC),
			ProofReference: "BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T",
		}},
		next: "C2",
	}
	h := NewWalletPaymentsHandler(fl)
	req := httptest.NewRequest(http.MethodGet, "/admin/v1/wallet-payments?limit=10", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var resp adminWalletPaymentListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 1 || resp.NextCursor != "C2" {
		t.Fatalf("items=%d next=%q", len(resp.Items), resp.NextCursor)
	}
	it := resp.Items[0]
	// No reference DERIVED from the payment id — see the gateway list test. The
	// only reference is the existing proof's, passed through as the store has it.
	if it.MerchantName != "Mercado Central, Lda." || !it.ReceiptAvailable {
		t.Errorf("mapping wrong: %+v", it)
	}
	if it.PayeeHandle != "mercado" || it.PayeeDisplayName != "Mercado Central" {
		t.Errorf("payee must be the Business's public identity: %+v", it)
	}
	if it.ProofReference != "BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T" {
		t.Errorf("proof_reference = %q, want the stored proof's", it.ProofReference)
	}
}

// A payment with no issued proof carries an empty proof_reference — the
// console shows "—", never a made-up value.
func TestAdminWalletPaymentsList_NoProofNoReference(t *testing.T) {
	fl := &fakeAdminLister{items: []service.AdminWalletPaymentItem{{
		ID: "bbbb1111-2222-3333-4444-555566667777", MerchantID: "m1", AmountMinor: 100, Currency: "AOA",
		Status: "COMPLETED", Environment: "SANDBOX", CreatedAt: time.Now(),
	}}}
	w := httptest.NewRecorder()
	NewWalletPaymentsHandler(fl).List(w, httptest.NewRequest(http.MethodGet, "/admin/v1/wallet-payments", nil))
	var raw struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil || len(raw.Items) != 1 {
		t.Fatalf("decode: %v %s", err, w.Body.String())
	}
	if v, ok := raw.Items[0]["proof_reference"]; !ok || v != "" {
		t.Fatalf("proof_reference = %v (present=%v), want empty", v, ok)
	}
}

func TestAdminWalletPaymentsList_InvalidLimit(t *testing.T) {
	h := NewWalletPaymentsHandler(&fakeAdminLister{})
	req := httptest.NewRequest(http.MethodGet, "/admin/v1/wallet-payments?limit=0", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestAdminWalletPaymentsList_Unavailable(t *testing.T) {
	h := NewWalletPaymentsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/admin/v1/wallet-payments", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}
