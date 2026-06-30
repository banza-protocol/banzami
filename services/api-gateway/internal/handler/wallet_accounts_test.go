package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeWalletAccounts struct {
	created int
	balance int64
}

func (f *fakeWalletAccounts) Create(ctx context.Context, in service.CreateWalletAccountInput) (*service.WalletAccount, error) {
	f.created++
	return &service.WalletAccount{ID: "wa-1", WalletID: in.WalletID, Purpose: in.Purpose, Status: "ACTIVE", Currency: "AOA"}, nil
}
func (f *fakeWalletAccounts) ListForWallet(ctx context.Context, walletID string) ([]*service.WalletAccount, error) {
	return []*service.WalletAccount{{ID: "wa-1", WalletID: walletID, Purpose: "PRIMARY", Status: "ACTIVE"}}, nil
}
func (f *fakeWalletAccounts) Get(ctx context.Context, id string) (*service.WalletAccount, error) {
	return &service.WalletAccount{ID: id, WalletID: "w-src", Purpose: "CAMPAIGN", Status: "ACTIVE", Currency: "AOA", AvailableBalanceMinor: f.balance}, nil
}
func (f *fakeWalletAccounts) Resolve(ctx context.Context, walletID, purpose, refType, refID string) (*service.WalletAccount, error) {
	return nil, nil
}
func (f *fakeWalletAccounts) CoreAccountID(ctx context.Context, id string) (string, error) {
	return "acc-1", nil
}

func activeMerchant() *fakeMerchants {
	return &fakeMerchants{rec: &service.MerchantRecord{ID: "doa-merchant", Status: service.MerchantStatusActive}}
}

func postAccount(h *WalletAccountHandler, principalMerchant, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/v1/business/wallet-accounts", strings.NewReader(body))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: principalMerchant, Environment: "SANDBOX"}))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	return rec
}

// An app may only open accounts inside a wallet it owns.
func TestWalletAccount_RejectsForeignWallet(t *testing.T) {
	h := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "other-merchant"}, activeMerchant())
	rec := postAccount(h, "doa-merchant", `{"wallet_id":"w-src","purpose":"CAMPAIGN","reference_id":"camp-1"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign wallet must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// A suspended/closed merchant cannot open accounts (KYB/compliance gate).
func TestWalletAccount_RejectsInactiveMerchant(t *testing.T) {
	suspended := &fakeMerchants{rec: &service.MerchantRecord{ID: "doa-merchant", Status: service.MerchantStatusSuspended}}
	h := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "doa-merchant"}, suspended)
	rec := postAccount(h, "doa-merchant", `{"wallet_id":"w-src","purpose":"CAMPAIGN","reference_id":"camp-1"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("suspended merchant must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// PRIMARY is provisioned with the wallet; an app cannot create it.
func TestWalletAccount_RejectsPrimary(t *testing.T) {
	h := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "doa-merchant"}, activeMerchant())
	rec := postAccount(h, "doa-merchant", `{"wallet_id":"w-src","purpose":"PRIMARY"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("PRIMARY must be 422, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// Unauthenticated callers are rejected before any work.
func TestWalletAccount_RejectsUnauthenticated(t *testing.T) {
	h := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "doa-merchant"}, activeMerchant())
	req := httptest.NewRequest("POST", "/v1/business/wallet-accounts", strings.NewReader(`{"wallet_id":"w-src","purpose":"CAMPAIGN"}`))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing principal must be 401, got %d", rec.Code)
	}
}

// Happy path: owned wallet + active merchant + non-PRIMARY purpose → 201.
func TestWalletAccount_CreatesCampaign(t *testing.T) {
	fa := &fakeWalletAccounts{}
	h := NewWalletAccountHandler(fa, &fakeWallets{merchantID: "doa-merchant"}, activeMerchant())
	rec := postAccount(h, "doa-merchant", `{"wallet_id":"w-src","purpose":"CAMPAIGN","reference_type":"DOA_CAMPAIGN","reference_id":"camp-1","label":"Campaign One"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fa.created != 1 {
		t.Fatalf("expected exactly one create, got %d", fa.created)
	}
	if strings.Contains(rec.Body.String(), "account_id") {
		t.Fatalf("safe DTO must not leak ledger account_id: %s", rec.Body.String())
	}
}
