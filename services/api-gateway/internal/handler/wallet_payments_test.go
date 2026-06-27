package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeLister struct {
	gotMerchant, gotEnv string
	items               []service.WalletPaymentListItem
	next                string
}

func (f *fakeLister) ListForMerchant(_ context.Context, merchantID, env string, _ service.WalletPaymentFilter) ([]service.WalletPaymentListItem, string, error) {
	f.gotMerchant, f.gotEnv = merchantID, env
	return f.items, f.next, nil
}

func wpReq(merchantID, env, query string) (*httptest.ResponseRecorder, *http.Request) {
	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/wallet-payments"+query, nil)
	ctx := middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: merchantID, Environment: env})
	return httptest.NewRecorder(), req.WithContext(ctx)
}

func TestWalletPaymentsList_ScopedAndMapped(t *testing.T) {
	fl := &fakeLister{
		items: []service.WalletPaymentListItem{
			{ID: "aaaa1111-2222-3333-4444-555566667777", AmountMinor: 2500000, Currency: "AOA", Status: "COMPLETED", PayerName: "João Manuel", CreatedAt: time.Date(2026, 6, 27, 14, 32, 0, 0, time.UTC)},
		},
		next: "CURSOR2",
	}
	h := NewWalletPaymentsHandler(fl)
	w, r := wpReq("m1", "LIVE", "?limit=10")
	h.List(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if fl.gotMerchant != "m1" || fl.gotEnv != "LIVE" {
		t.Errorf("scoping not applied: merchant=%q env=%q", fl.gotMerchant, fl.gotEnv)
	}
	var resp walletPaymentListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 1 || resp.NextCursor != "CURSOR2" {
		t.Fatalf("items=%d next=%q", len(resp.Items), resp.NextCursor)
	}
	it := resp.Items[0]
	if it.Reference != "BZM-AAAA-1111" {
		t.Errorf("reference = %q", it.Reference)
	}
	if !it.ReceiptAvailable {
		t.Error("COMPLETED should have receipt_available true")
	}
	if it.PayerName != "João Manuel" || it.AmountMinor != 2500000 {
		t.Errorf("mapping wrong: %+v", it)
	}
}

func TestWalletPaymentsList_RequiresMerchant(t *testing.T) {
	h := NewWalletPaymentsHandler(&fakeLister{})
	req := httptest.NewRequest(http.MethodGet, "/v1/merchant/wallet-payments", nil) // no principal
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestWalletPaymentsList_InvalidLimit(t *testing.T) {
	h := NewWalletPaymentsHandler(&fakeLister{})
	w, r := wpReq("m1", "LIVE", "?limit=999")
	h.List(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestWalletPaymentsList_Unavailable(t *testing.T) {
	h := NewWalletPaymentsHandler(nil)
	w, r := wpReq("m1", "LIVE", "")
	h.List(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}
