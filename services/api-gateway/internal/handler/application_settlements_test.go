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
	lastInput          service.CreateApplicationSettlementInput
}

func (f *fakeSettlements) Create(ctx context.Context, in service.CreateApplicationSettlementInput) (*service.ApplicationSettlement, error) {
	f.created++
	f.lastInput = in
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

// fakeParties resolves @handle → an account; keyed by handle so beneficiary and
// fee destination get distinct accounts. ownerType/ownerID configurable.
type fakeParties struct {
	ownerType string // default MERCHANT
	ownerID   string // default doa-merchant
	err       error
}

func (f *fakeParties) Resolve(ctx context.Context, handle, currency string) (*service.ResolvedParty, error) {
	if f.err != nil {
		return nil, f.err
	}
	ot := f.ownerType
	if ot == "" {
		ot = "MERCHANT"
	}
	oid := f.ownerID
	if oid == "" {
		oid = "doa-merchant"
	}
	h := strings.TrimPrefix(handle, "@") // mirror the real resolver
	return &service.ResolvedParty{Handle: h, OwnerType: ot, OwnerID: oid, AvailableAccountID: "acct-" + h, Currency: currency}, nil
}

func postBusiness(h *ApplicationSettlementHandler, principalMerchant, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/v1/business/application-settlements", strings.NewReader(body))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: principalMerchant, Environment: "SANDBOX"}))
	rec := httptest.NewRecorder()
	h.CreateBusiness(rec, req)
	return rec
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
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "other-merchant", available: 100000}, &fakeWalletAccounts{}, &fakeParties{})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_id":"w-src","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign source wallet must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// Happy path: owned source + balance → create + complete, gross = read balance.
func TestApplicationSettlement_CreatesAndCompletes(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant", available: 100000}, &fakeWalletAccounts{}, &fakeParties{})
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
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant", available: 0}, &fakeWalletAccounts{}, &fakeParties{})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_id":"w-src","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("zero balance must be 422, got %d", rec.Code)
	}
	if fs.created != 0 {
		t.Fatal("must not create a settlement when there is nothing to settle")
	}
}

// ADR-042: settle FROM a specific segregated (campaign) account. Gross is the
// account balance; the app sends no amount and never sees the ledger account id.
func TestApplicationSettlement_FromCampaignAccount(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 95000}, &fakeParties{})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_account_id":"wa-1","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fs.created != 1 || fs.completed != 1 {
		t.Fatalf("expected create+complete, got created=%d completed=%d", fs.created, fs.completed)
	}
}

// Ownership: a campaign account whose parent wallet belongs to another merchant
// must be rejected.
func TestApplicationSettlement_FromForeignCampaignAccount(t *testing.T) {
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "other-merchant"}, &fakeWalletAccounts{}, &fakeParties{})
	rec := postSettlement(t, h, "doa-merchant",
		`{"idempotency_key":"k1","owner_ref":"camp-1","source_wallet_account_id":"wa-1","beneficiary_wallet_id":"w-ben"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign campaign account must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// ADR-029 — app-defined business settlement (/v1/business/application-settlements)
// ---------------------------------------------------------------------------

const doaBody = `{"idempotency_key":"doa-c1","source_account_id":"wa-camp","beneficiary_banza_name":"@maria","fee_destination_banza_name":"@doa","application_fee_bps":500,"reason":"CAMPAIGN_CLOSE","reference_type":"DOA_CAMPAIGN","reference_id":"campaign_123"}`

// Happy path: app-defined 5% on an owned CAMPAIGN account → create + complete,
// fee bps + resolved beneficiary/fee accounts passed to core.
func TestBusinessSettlement_AppDefinedFee(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 200000}, &fakeParties{})
	rec := postBusiness(h, "doa-merchant", doaBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fs.created != 1 || fs.completed != 1 {
		t.Fatalf("want create+complete, got created=%d completed=%d", fs.created, fs.completed)
	}
	if fs.lastInput.ApplicationFeeBps != 500 {
		t.Fatalf("app-defined bps must reach core, got %d", fs.lastInput.ApplicationFeeBps)
	}
	if fs.lastInput.BeneficiaryAccountID != "acct-maria" || fs.lastInput.ApplicationFeeAccountID != "acct-doa" {
		t.Fatalf("resolved @names must be passed: ben=%q fee=%q", fs.lastInput.BeneficiaryAccountID, fs.lastInput.ApplicationFeeAccountID)
	}
	if fs.lastInput.GrossAmountMinor != 200000 {
		t.Fatalf("gross must be the account balance, got %d", fs.lastInput.GrossAmountMinor)
	}
}

// Source must be a segregated account, never the PRIMARY/default.
func TestBusinessSettlement_RejectsPrimarySource(t *testing.T) {
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 200000, purpose: "PRIMARY"}, &fakeParties{})
	rec := postBusiness(h, "doa-merchant", doaBody)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("PRIMARY source must be 422, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// A fee > 0 with no fee destination is a bad request.
func TestBusinessSettlement_FeeWithoutDestination(t *testing.T) {
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 200000}, &fakeParties{})
	rec := postBusiness(h, "doa-merchant",
		`{"idempotency_key":"k","source_account_id":"wa","beneficiary_banza_name":"@maria","application_fee_bps":500}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("fee without destination must be 400, got %d", rec.Code)
	}
}

// The fee destination must be the caller's OWN business account.
func TestBusinessSettlement_RejectsForeignFeeDestination(t *testing.T) {
	parties := &fakeParties{ownerType: "MERCHANT", ownerID: "someone-else"}
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 200000}, parties)
	rec := postBusiness(h, "doa-merchant", doaBody)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign fee destination must be 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// A beneficiary handle that resolves to no wallet → 422.
func TestBusinessSettlement_BeneficiaryNotFound(t *testing.T) {
	parties := &fakeParties{err: service.ErrNotFound}
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 200000}, parties)
	rec := postBusiness(h, "doa-merchant", doaBody)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unresolvable beneficiary must be 422, got %d", rec.Code)
	}
}
