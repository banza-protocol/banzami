package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Wallet accounts under a developer credential.
//
// The invariant these pin is the one the whole model rests on: a project may
// open and read accounts BENEATH the owner its binding established, and may do
// nothing at all outside it. The wallet is never taken from the request.

type devAccounts struct {
	created *service.CreateWalletAccountInput
	byID    map[string]*service.WalletAccount
	byWal   map[string][]*service.WalletAccount
}

func (f *devAccounts) Create(_ context.Context, in service.CreateWalletAccountInput) (*service.WalletAccount, error) {
	f.created = &in
	return &service.WalletAccount{ID: "new-wa", WalletID: in.WalletID, Purpose: in.Purpose}, nil
}
func (f *devAccounts) ListForWallet(_ context.Context, walletID string) ([]*service.WalletAccount, error) {
	return f.byWal[walletID], nil
}
func (f *devAccounts) Get(_ context.Context, id string) (*service.WalletAccount, error) {
	return f.byID[id], nil
}
func (f *devAccounts) Resolve(context.Context, string, string, string, string) (*service.WalletAccount, error) {
	return nil, nil
}
func (f *devAccounts) CoreAccountID(context.Context, string) (string, error) { return "", nil }

func devWalletHandler(acc *devAccounts) *WalletAccountHandler {
	return NewWalletAccountHandler(acc, &fakeWallets{}, activeMerchant())
}

func devWalletReq(method, target, body string, scopes ...string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), boundDevPrincipal(scopes...)))
}

func TestDevKeyWalletAccount_CreatedUnderTheBoundWallet(t *testing.T) {
	acc := &devAccounts{}
	h := devWalletHandler(acc)
	rec := httptest.NewRecorder()
	h.Create(rec, devWalletReq("POST", "https://x/v1/business/wallet-accounts",
		`{"purpose":"CAMPAIGN","reference_type":"DOA_CAMPAIGN","reference_id":"c-1","label":"School A"}`,
		"wallet_accounts:create"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d (%s)", rec.Code, rec.Body.String())
	}
	if acc.created == nil || acc.created.WalletID != "bound-wallet" {
		t.Fatalf("account must be created under the BOUND wallet, got %+v", acc.created)
	}
	if acc.created.MerchantID != "bound-merchant" {
		t.Fatalf("owner must come from the binding, got %q", acc.created.MerchantID)
	}
}

// Naming the wallet is naming the owner. It is refused even when the value
// happens to be the caller's own — accepting it would make the field look
// authoritative, and the next caller supplies someone else's.
func TestDevKeyWalletAccount_RejectsClientSuppliedWallet(t *testing.T) {
	h := devWalletHandler(&devAccounts{})
	for _, body := range []string{
		`{"wallet_id":"someone-elses-wallet","purpose":"CAMPAIGN"}`,
		`{"wallet_id":"bound-wallet","purpose":"CAMPAIGN"}`,
	} {
		rec := httptest.NewRecorder()
		h.Create(rec, devWalletReq("POST", "https://x/v1/business/wallet-accounts", body, "wallet_accounts:create"))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "PAYEE_NOT_ALLOWED") {
			t.Fatalf("client wallet %s must be rejected, got %d (%s)", body, rec.Code, rec.Body.String())
		}
	}
}

func TestDevKeyWalletAccount_ListIsScopedToTheBoundWallet(t *testing.T) {
	acc := &devAccounts{byWal: map[string][]*service.WalletAccount{
		"bound-wallet":         {{ID: "mine-1", WalletID: "bound-wallet"}},
		"someone-elses-wallet": {{ID: "theirs-1", WalletID: "someone-elses-wallet"}},
	}}
	h := devWalletHandler(acc)
	// A wallet_id in the query must not redirect the listing.
	rec := httptest.NewRecorder()
	h.List(rec, devWalletReq("GET", "https://x/v1/business/wallet-accounts?wallet_id=someone-elses-wallet", "", "wallet_accounts:read"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a supplied wallet_id must be refused, got %d (%s)", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	h.List(rec, devWalletReq("GET", "https://x/v1/business/wallet-accounts", "", "wallet_accounts:read"))
	if rec.Code != http.StatusOK {
		t.Fatalf("list = %d (%s)", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "mine-1") || strings.Contains(body, "theirs-1") {
		t.Fatalf("listing must contain only the bound wallet's accounts: %s", body)
	}
}

func TestDevKeyWalletAccount_ForeignReadIsNotFound(t *testing.T) {
	acc := &devAccounts{byID: map[string]*service.WalletAccount{
		"mine-1":   {ID: "mine-1", WalletID: "bound-wallet"},
		"theirs-1": {ID: "theirs-1", WalletID: "someone-elses-wallet"},
	}}
	h := devWalletHandler(acc)
	for id, want := range map[string]int{"mine-1": http.StatusOK, "theirs-1": http.StatusNotFound, "nope": http.StatusNotFound} {
		req := devWalletReq("GET", "https://x/v1/business/wallet-accounts/"+id, "", "wallet_accounts:read")
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", id)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rec := httptest.NewRecorder()
		h.Get(rec, req)
		if rec.Code != want {
			t.Fatalf("get %s = %d, want %d (%s)", id, rec.Code, want, rec.Body.String())
		}
	}
}

func TestDevKeyWalletAccount_ScopeIsRequired(t *testing.T) {
	h := devWalletHandler(&devAccounts{})
	// Payment scopes do not imply wallet-account authority.
	rec := httptest.NewRecorder()
	h.Create(rec, devWalletReq("POST", "https://x/v1/business/wallet-accounts",
		`{"purpose":"CAMPAIGN"}`, "payment_sessions:write"))
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "INSUFFICIENT_SCOPE") {
		t.Fatalf("missing scope must 403, got %d (%s)", rec.Code, rec.Body.String())
	}
	// Read does not imply create.
	rec = httptest.NewRecorder()
	h.Create(rec, devWalletReq("POST", "https://x/v1/business/wallet-accounts",
		`{"purpose":"CAMPAIGN"}`, "wallet_accounts:read"))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("read scope must not authorize create, got %d", rec.Code)
	}
}

// Settlement moves money OUT. Its authority must be as tight as the payment
// path's, and its scope must be its own — taking payments is not permission to
// pay funds away.

func devSettlementReq(body string, scopes ...string) *http.Request {
	req := httptest.NewRequest("POST", "https://x/v1/business/application-settlements", strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), boundDevPrincipal(scopes...)))
}

func TestDevKeySettlement_RequiresItsOwnScope(t *testing.T) {
	h := settlementHandlerForDev()
	for _, scope := range []string{"payment_sessions:write", "wallet_accounts:create", "wallet_accounts:read"} {
		rec := httptest.NewRecorder()
		h.CreateBusiness(rec, devSettlementReq(
			`{"idempotency_key":"k1","source_account_id":"mine-wa","beneficiary_banza_name":"@ben"}`, scope))
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "INSUFFICIENT_SCOPE") {
			t.Fatalf("scope %s must not authorize settlement, got %d (%s)", scope, rec.Code, rec.Body.String())
		}
	}
}

func TestDevKeySettlement_ForeignSourceAccountRefused(t *testing.T) {
	h := settlementHandlerForDev()
	rec := httptest.NewRecorder()
	h.CreateBusiness(rec, devSettlementReq(
		`{"idempotency_key":"k2","source_account_id":"theirs-wa","beneficiary_banza_name":"@ben"}`,
		"application_settlements:write"))
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("settling from another owner's account must be refused, got %d (%s)", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "balance") {
		t.Fatalf("refusal must not disclose the victim account's state: %s", rec.Body.String())
	}
}

func TestDevKeySettlement_UnboundProjectCannotSettle(t *testing.T) {
	h := settlementHandlerForDev()
	p := boundDevPrincipal("application_settlements:write")
	p.Bound = false
	req := httptest.NewRequest("POST", "https://x/v1/business/application-settlements",
		strings.NewReader(`{"idempotency_key":"k3","source_account_id":"mine-wa","beneficiary_banza_name":"@ben"}`))
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p))
	rec := httptest.NewRecorder()
	h.CreateBusiness(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("an unbound project must not settle, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// Ownership has to be modelled, not assumed: the shared wallet fake reports the
// same owner for every id, which would let a foreign-account test pass for the
// wrong reason. Here "mine-wa" sits under the bound merchant's wallet and
// "theirs-wa" under someone else's.
type ownedWallets struct{ byWallet map[string]string }

func (f *ownedWallets) Create(context.Context, string, string) (*service.WalletRecord, error) {
	return nil, nil
}
func (f *ownedWallets) Get(_ context.Context, id string) (*service.WalletRecord, error) {
	return &service.WalletRecord{ID: id, MerchantID: f.byWallet[id], Currency: "AOA"}, nil
}
func (f *ownedWallets) Balance(_ context.Context, id string) (*service.WalletBalance, error) {
	return &service.WalletBalance{WalletID: id, Currency: "AOA", AvailableMinor: 100000}, nil
}
func (f *ownedWallets) GetForMerchant(context.Context, string, string) (*service.WalletRecord, error) {
	return nil, nil
}
func (f *ownedWallets) SandboxFund(context.Context, string, int64, string) (*service.WalletBalance, error) {
	return nil, nil
}
func (f *ownedWallets) Analytics(context.Context, string, string, string) (json.RawMessage, error) {
	return nil, nil
}

type ownedAccounts struct{ walletOf map[string]string }

func (f *ownedAccounts) Create(context.Context, service.CreateWalletAccountInput) (*service.WalletAccount, error) {
	return nil, nil
}
func (f *ownedAccounts) ListForWallet(context.Context, string) ([]*service.WalletAccount, error) {
	return nil, nil
}
func (f *ownedAccounts) Get(_ context.Context, id string) (*service.WalletAccount, error) {
	w, ok := f.walletOf[id]
	if !ok {
		return nil, nil
	}
	return &service.WalletAccount{ID: id, WalletID: w, Purpose: "CAMPAIGN", Status: "ACTIVE", Currency: "AOA", AvailableBalanceMinor: 100000}, nil
}
func (f *ownedAccounts) Resolve(context.Context, string, string, string, string) (*service.WalletAccount, error) {
	return nil, nil
}
func (f *ownedAccounts) CoreAccountID(_ context.Context, id string) (string, error) {
	return "core-" + id, nil
}

func settlementHandlerForDev() *ApplicationSettlementHandler {
	return NewApplicationSettlementHandler(
		&fakeSettlements{},
		&ownedWallets{byWallet: map[string]string{
			"bound-wallet":         "bound-merchant",
			"someone-elses-wallet": "another-merchant",
		}},
		&ownedAccounts{walletOf: map[string]string{
			"mine-wa":   "bound-wallet",
			"theirs-wa": "someone-elses-wallet",
		}},
		&fakeParties{},
		pricedFake(),
	)
}
