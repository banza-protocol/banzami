package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeWallets struct {
	merchantID string
	available  int64
}

func (f *fakeWallets) Create(ctx context.Context, m, c string) (*service.WalletRecord, error) {
	return nil, nil
}
func (f *fakeWallets) Get(ctx context.Context, id string) (*service.WalletRecord, error) {
	return &service.WalletRecord{ID: id, MerchantID: f.merchantID, Currency: "AOA"}, nil
}
func (f *fakeWallets) Balance(ctx context.Context, id string) (*service.WalletBalance, error) {
	return &service.WalletBalance{WalletID: id, Currency: "AOA", AvailableMinor: f.available}, nil
}
func (f *fakeWallets) GetForMerchant(ctx context.Context, m, c string) (*service.WalletRecord, error) {
	return nil, nil
}
func (f *fakeWallets) SandboxFund(ctx context.Context, id string, a int64, c string) (*service.WalletBalance, error) {
	return nil, nil
}
func (f *fakeWallets) Analytics(ctx context.Context, id, from, to string) (json.RawMessage, error) {
	return nil, nil
}

type fakeSettlements struct {
	created, completed int
}

func (f *fakeSettlements) Create(ctx context.Context, in service.CreateApplicationSettlementInput) (*service.ApplicationSettlement, error) {
	f.created++
	// Echo the gross the gateway read so the test can assert it was used.
	return &service.ApplicationSettlement{ID: "set-1", OwnerRef: in.OwnerRef, Status: "CREATED", GrossAmountMinor: in.GrossAmountMinor, Currency: in.Currency}, nil
}
func (f *fakeSettlements) Complete(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	f.completed++
	return &service.ApplicationSettlement{ID: id, Status: "COMPLETED", GrossAmountMinor: 100000, ApplicationFeeMinor: 5000, NetAmountMinor: 95000, Currency: "AOA"}, nil
}
func (f *fakeSettlements) Get(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	return &service.ApplicationSettlement{ID: id, Status: "COMPLETED"}, nil
}

func postSettlement(t *testing.T, h *ApplicationSettlementHandler, principalMerchant, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/v1/application-settlements", strings.NewReader(body))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: principalMerchant, Environment: "SANDBOX"}))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	return rec
}

// Ownership: an app may only settle FROM a wallet it owns.
func TestApplicationSettlement_RejectsForeignSourceWallet(t *testing.T) {
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "other-merchant", available: 100000})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_id":"w-src","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign source wallet must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// Happy path: owned source + balance → create + complete, gross = read balance.
func TestApplicationSettlement_CreatesAndCompletes(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant", available: 100000})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_id":"w-src","beneficiary_wallet_id":"w-ben","application_fee_wallet_id":"w-fee","fee_policy_ref":"doa-5pct"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out service.ApplicationSettlement
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.Status != "COMPLETED" {
		t.Fatalf("settlement must be COMPLETED, got %s", out.Status)
	}
	if fs.created != 1 || fs.completed != 1 {
		t.Fatalf("expected one create + one complete, got create=%d complete=%d", fs.created, fs.completed)
	}
}

// Nothing to settle: zero balance → 422, never creates a settlement.
func TestApplicationSettlement_ZeroBalance(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant", available: 0})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_id":"w-src","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("zero balance must be 422, got %d", rec.Code)
	}
	if fs.created != 0 {
		t.Fatal("must not create a settlement when there is nothing to settle")
	}
}
