package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeWalletAccounts struct {
	created int
	balance int64
	purpose string // default CAMPAIGN
}

func (f *fakeWalletAccounts) purposeOr() string {
	if f.purpose == "" {
		return "CAMPAIGN"
	}
	return f.purpose
}

func (f *fakeWalletAccounts) Create(ctx context.Context, in service.CreateWalletAccountInput) (*service.WalletAccount, error) {
	f.created++
	return &service.WalletAccount{ID: "wa-1", WalletID: in.WalletID, Purpose: in.Purpose, Status: "ACTIVE", Currency: "AOA"}, nil
}
func (f *fakeWalletAccounts) ListForWallet(ctx context.Context, walletID string) ([]*service.WalletAccount, error) {
	return []*service.WalletAccount{{ID: "wa-1", WalletID: walletID, Purpose: "PRIMARY", Status: "ACTIVE"}}, nil
}
func (f *fakeWalletAccounts) Get(ctx context.Context, id string) (*service.WalletAccount, error) {
	return &service.WalletAccount{ID: id, WalletID: "w-src", Purpose: f.purposeOr(), Status: "ACTIVE", Currency: "AOA", AvailableBalanceMinor: f.balance}, nil
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
	req := httptest.NewRequest("POST", "/v1/wallet-accounts", strings.NewReader(body))
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
	req := httptest.NewRequest("POST", "/v1/wallet-accounts", strings.NewReader(`{"wallet_id":"w-src","purpose":"CAMPAIGN"}`))
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

// A Business reading one of its own wallet accounts by id always got 400
// "wallet_id is required": the read passed no wallet, and the merchant path
// demanded one. The account's own wallet says whose it is.
func TestWalletAccount_MerchantReadsItsOwnAccountById(t *testing.T) {
	get := func(h *WalletAccountHandler, merchantID, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/v1/wallet-accounts/"+id, nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", id)
		req = req.WithContext(context.WithValue(
			middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: merchantID, Environment: "SANDBOX"}),
			chi.RouteCtxKey, rctx))
		rec := httptest.NewRecorder()
		h.Get(rec, req)
		return rec
	}

	own := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "doa-merchant"}, activeMerchant())
	if rec := get(own, "doa-merchant", "wa-1"); rec.Code != http.StatusOK {
		t.Fatalf("a Business could not read its own wallet account: %d %s", rec.Code, rec.Body.String())
	}
	// Someone else's account is not found — never a code that says it exists.
	foreign := NewWalletAccountHandler(&fakeWalletAccounts{}, &fakeWallets{merchantID: "other-merchant"}, activeMerchant())
	if rec := get(foreign, "doa-merchant", "wa-1"); rec.Code != http.StatusNotFound {
		t.Fatalf("another merchant's account answered %d, want 404", rec.Code)
	}
	if rec := get(own, "", "wa-1"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("an unauthenticated read answered %d, want 401", rec.Code)
	}
}
