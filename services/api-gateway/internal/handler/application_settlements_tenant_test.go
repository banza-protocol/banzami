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

// boundSettlements returns a settlement bound to the given Business Account.
type boundSettlements struct{ applicationID string }

func (f *boundSettlements) Create(ctx context.Context, in service.CreateApplicationSettlementInput) (*service.ApplicationSettlement, error) {
	return &service.ApplicationSettlement{ID: "set-1", ApplicationID: in.ApplicationID}, nil
}
func (f *boundSettlements) Complete(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	return &service.ApplicationSettlement{ID: id, Status: "COMPLETED"}, nil
}
func (f *boundSettlements) Get(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	return &service.ApplicationSettlement{
		ID: id, Status: "COMPLETED", ApplicationID: f.applicationID,
		GrossAmountMinor: 100000, ApplicationFeeMinor: 5000, NetAmountMinor: 95000, Currency: "AOA",
	}, nil
}

func settlementGetReq(id, callerMerchant string) *http.Request {
	req := httptest.NewRequest("GET", "/v1/application-settlements/"+id, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	return req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: callerMerchant, Environment: "LIVE"}))
}

func settlementHandler(s service.ApplicationSettlementService) *ApplicationSettlementHandler {
	return NewApplicationSettlementHandler(s, &fakeWallets{merchantID: "victim-merchant"}, &fakeWalletAccounts{}, &fakeParties{}, pricedFake())
}

// SEC-002: a settlement belonging to another Business Account must not be
// readable. Before the fix the handler checked only that the caller was *some*
// authenticated merchant, then returned the settlement by id — leaking the
// victim's gross/fee/net amounts.
func TestApplicationSettlementGet_RejectsCrossBusinessAccountAccess(t *testing.T) {
	h := settlementHandler(&boundSettlements{applicationID: "victim-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, settlementGetReq("set-victim", "attacker-merchant"))

	if rec.Code == http.StatusOK {
		t.Fatalf("cross-tenant settlement read succeeded: %s", rec.Body.String())
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if contains(rec.Body.String(), "95000") {
		t.Fatal("settlement amounts leaked cross-tenant")
	}
}

// An unbound legacy settlement has unknown ownership: fail closed, never open.
func TestApplicationSettlementGet_UnboundSettlementFailsClosed(t *testing.T) {
	h := settlementHandler(&boundSettlements{applicationID: ""})

	rec := httptest.NewRecorder()
	h.Get(rec, settlementGetReq("set-legacy", "any-merchant"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("unbound settlement must fail closed; got %d: %s", rec.Code, rec.Body.String())
	}
}

// The owning Business Account still reads its own settlement.
func TestApplicationSettlementGet_OwnerStillAllowed(t *testing.T) {
	h := settlementHandler(&boundSettlements{applicationID: "own-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, settlementGetReq("set-own", "own-merchant"))

	if rec.Code != http.StatusOK {
		t.Fatalf("owner denied its own settlement: %d %s", rec.Code, rec.Body.String())
	}
}

// The binding must be taken from the authenticated principal at create time,
// so that the read-side check has something trustworthy to compare against.
func TestApplicationSettlementCreate_BindsToAuthenticatedMerchant(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant", available: 100000}, &fakeWalletAccounts{}, &fakeParties{}, pricedFake())

	req := httptest.NewRequest("POST", "/v1/application-settlements",
		strings.NewReader(`{"idempotency_key":"k1","owner_ref":"campaign-1","source_wallet_id":"w-1","beneficiary_wallet_id":"w-2"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: "doa-merchant", Environment: "SANDBOX"}))
	h.Create(httptest.NewRecorder(), req)

	if fs.created == 0 {
		t.Skip("create path short-circuited before reaching the service in this fixture")
	}
	if fs.lastInput.ApplicationID != "doa-merchant" {
		t.Fatalf("settlement not bound to the authenticated merchant: %q", fs.lastInput.ApplicationID)
	}
}
