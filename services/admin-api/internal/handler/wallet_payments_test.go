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
			PayerName: "João Manuel", AmountMinor: 2500000, Currency: "AOA", Status: "COMPLETED",
			Environment: "LIVE", CreatedAt: time.Date(2026, 6, 27, 14, 32, 0, 0, time.UTC),
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
	if it.Reference != "BZM-AAAA-1111" || it.MerchantName != "Mercado Central, Lda." || !it.ReceiptAvailable {
		t.Errorf("mapping wrong: %+v", it)
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
