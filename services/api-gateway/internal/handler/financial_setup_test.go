package handler

// GET /v1/financial-setup is a projection. Every rule is decided in core; what
// these tests hold is the projection itself: the Project key is the only
// authority, the Project is named by its own id, nothing behind it is named,
// an unconfigured Project is a state, and an outage is never a configuration
// fact.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeReadiness struct {
	res      *service.SettlementReadiness
	err      error
	merchant string
	fee      *service.ReadinessFeeDestination
	calls    int
}

func (f *fakeReadiness) Readiness(_ context.Context, merchantID, _ string, fee *service.ReadinessFeeDestination) (*service.SettlementReadiness, error) {
	f.calls++
	f.merchant, f.fee = merchantID, fee
	return f.res, f.err
}

type readinessParties struct {
	party *service.ResolvedParty
	err   error
}

func (f *readinessParties) Resolve(context.Context, string, string) (*service.ResolvedParty, error) {
	return f.party, f.err
}

func strp(s string) *string { return &s }
func u32p(v uint32) *uint32 { return &v }

// readyCore is what core answers for an eligible owner on sandbox-reference.
func readyCore() *service.SettlementReadiness {
	r := &service.SettlementReadiness{}
	r.FinancialIdentity.Handle = strp("doa")
	r.Kyb.Status = "APPROVED"
	r.Wallet.Status, r.Wallet.Currency, r.Wallet.Ready = strp("ACTIVE"), "AOA", true
	r.Pricing.Profile, r.Pricing.Configured = strp("sandbox-reference"), true
	r.Pricing.SettlementBps, r.Pricing.PayoutBps = u32p(200), u32p(75)
	fd := &r.FeeDestination
	fd.Handle, fd.Required, fd.Resolved, fd.OwnedByProject = strp("doa"), true, true, true
	fd.Active, fd.KybApproved, fd.WalletActive, fd.TypeAllowed, fd.Eligible = true, true, true, true, true
	r.Settlement.Ready, r.Settlement.Blockers, r.Settlement.Warnings = true, []string{}, []string{}
	return r
}

func getFinancialSetup(h *FinancialSetupHandler, p *middleware.DeveloperPrincipal, query string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/v1/financial-setup"+query, nil)
	if p != nil {
		req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p))
	}
	rec := httptest.NewRecorder()
	h.FinancialSetup(rec, req)
	return rec
}

func decodeSetup(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestFinancialSetup_AReadyProjectReadsItsWholeReadiness(t *testing.T) {
	core := &fakeReadiness{res: readyCore()}
	p := devPrincipal("doa-sandbox")
	p.Sealed = true
	out := decodeSetup(t, getFinancialSetup(NewFinancialSetupHandler(core, nil), p, ""))

	if core.merchant != "merchant-internal-uuid" {
		t.Fatalf("readiness asked about %q, want the binding's owner", core.merchant)
	}
	if core.fee != nil {
		t.Fatal("no fee destination named: core evaluates the owner's own identity")
	}
	project := out["project"].(map[string]any)
	if project["id"] != testProjectUUID || project["name"] != "Doa Sandbox" || project["ref"] != "doa-sandbox" {
		t.Errorf("project = %#v", project)
	}
	if out["environment"] != "SANDBOX" {
		t.Errorf("environment = %v", out["environment"])
	}
	fs := out["financial_setup"].(map[string]any)
	if fs["state"] != "SEALED" || fs["configured"] != true || fs["sealed"] != true {
		t.Errorf("financial_setup = %#v", fs)
	}
	if h := out["financial_identity"].(map[string]any)["handle"]; h != "@doa" {
		t.Errorf("handle = %v, want @doa", h)
	}
	pricing := out["pricing"].(map[string]any)
	if pricing["profile"] != "sandbox-reference" || pricing["settlement_bps"] != float64(200) || pricing["payout_bps"] != float64(75) {
		t.Errorf("pricing = %#v", pricing)
	}
	fd := out["fee_destination"].(map[string]any)
	for _, k := range []string{"resolved", "owned_by_project", "kyb_approved", "wallet_active", "type_allowed", "application_account_ready"} {
		if fd[k] != true {
			t.Errorf("fee_destination.%s = %v", k, fd[k])
		}
	}
	st := out["settlement"].(map[string]any)
	if st["ready"] != true || len(st["blockers"].([]any)) != 0 {
		t.Errorf("settlement = %#v", st)
	}
}

// A bound, unsealed Project is READY — configured, destination still movable.
func TestFinancialSetup_UnsealedIsReady(t *testing.T) {
	out := decodeSetup(t, getFinancialSetup(NewFinancialSetupHandler(&fakeReadiness{res: readyCore()}, nil), devPrincipal("p"), ""))
	fs := out["financial_setup"].(map[string]any)
	if fs["state"] != "READY" || fs["sealed"] != false {
		t.Errorf("financial_setup = %#v", fs)
	}
}

// Core's blockers are reported as core decided them — never recomputed.
func TestFinancialSetup_CoresBlockersAreTheBlockers(t *testing.T) {
	res := readyCore()
	res.FeeDestination.TypeAllowed, res.FeeDestination.Eligible = false, false
	res.FeeDestination.Blocker = strp("FEE_DESTINATION_TYPE_NOT_ALLOWED")
	res.Settlement.Ready, res.Settlement.Blockers = false, []string{"FEE_DESTINATION_TYPE_NOT_ALLOWED"}
	res.Settlement.Warnings = []string{"WEBHOOK_ENDPOINT_MISSING"}
	out := decodeSetup(t, getFinancialSetup(NewFinancialSetupHandler(&fakeReadiness{res: res}, nil), devPrincipal("p"), ""))
	st := out["settlement"].(map[string]any)
	if st["ready"] != false {
		t.Fatal("settlement.ready must be core's answer")
	}
	if b := st["blockers"].([]any); len(b) != 1 || b[0] != "FEE_DESTINATION_TYPE_NOT_ALLOWED" {
		t.Errorf("blockers = %v", b)
	}
	if w := st["warnings"].([]any); len(w) != 1 || w[0] != "WEBHOOK_ENDPOINT_MISSING" {
		t.Errorf("warnings = %v", w)
	}
}

// Every Project starts unconfigured. That is a state, reported in the same
// shape with the one blocker that says why — and core is not asked about an
// owner that does not exist.
func TestFinancialSetup_AnUnboundProjectIsUnconfiguredNotAnError(t *testing.T) {
	core := &fakeReadiness{res: readyCore()}
	p := devPrincipal("fresh")
	p.Bound, p.MerchantID, p.WalletID = false, "", ""
	out := decodeSetup(t, getFinancialSetup(NewFinancialSetupHandler(core, nil), p, ""))
	if core.calls != 0 {
		t.Fatal("core was asked about a Project with no owner")
	}
	fs := out["financial_setup"].(map[string]any)
	if fs["state"] != "UNCONFIGURED" || fs["configured"] != false {
		t.Errorf("financial_setup = %#v", fs)
	}
	st := out["settlement"].(map[string]any)
	if b := st["blockers"].([]any); st["ready"] != false || len(b) != 1 || b[0] != "FINANCIAL_SETUP_NOT_CONFIGURED" {
		t.Errorf("settlement = %#v", st)
	}
	if out["project"].(map[string]any)["id"] != testProjectUUID {
		t.Error("an unconfigured Project is still named")
	}
}

// Nothing behind the Project is named — whatever core or the key carried.
func TestFinancialSetup_NamesNothingBehindTheProject(t *testing.T) {
	raw := getFinancialSetup(NewFinancialSetupHandler(&fakeReadiness{res: readyCore()}, nil), devPrincipal("p"), "").Body.String()
	for _, leaked := range []string{
		"merchant-internal-uuid", "merchant_id",
		"wallet-internal-uuid", "wallet_id", "account_id",
		"ws-internal-uuid", "workspace_id", "key-internal-uuid", "binding",
	} {
		if strings.Contains(raw, leaked) {
			t.Fatalf("/v1/financial-setup leaked %q: %s", leaked, raw)
		}
	}
}

func TestFinancialSetup_Authority(t *testing.T) {
	h := NewFinancialSetupHandler(&fakeReadiness{res: readyCore()}, nil)
	if rec := getFinancialSetup(h, nil, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("no Project key: want 401, got %d", rec.Code)
	}
	p := devPrincipal("p")
	p.Scopes = []string{"payments:write"}
	if rec := getFinancialSetup(h, p, ""); rec.Code != http.StatusForbidden {
		t.Errorf("no identity:read: want 403, got %d", rec.Code)
	}
}

// Nothing in the request chooses whose readiness is read.
func TestFinancialSetup_TheRequestCannotNameAnotherOwner(t *testing.T) {
	core := &fakeReadiness{res: readyCore()}
	getFinancialSetup(NewFinancialSetupHandler(core, nil), devPrincipal("p"), "?merchant_id=victim&project_id=other")
	if core.merchant != "merchant-internal-uuid" {
		t.Fatalf("readiness asked about %q", core.merchant)
	}
}

func TestFinancialSetup_ErrorsAreNotConfigurationFacts(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want int
		code string
	}{
		{"owner missing in core", service.ErrNotFound, http.StatusConflict, "FINANCIAL_SETUP_CONFLICT"},
		{"core refused", &service.CoreError{Status: 400, Code: "BAD_REQUEST"}, http.StatusConflict, "FINANCIAL_SETUP_CONFLICT"},
		{"core failed", &service.CoreError{Status: 500}, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
		{"core unreachable", &service.TransportError{Err: errors.New("refused")}, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := getFinancialSetup(NewFinancialSetupHandler(&fakeReadiness{err: tc.err}, nil), devPrincipal("p"), "")
			if rec.Code != tc.want || !strings.Contains(rec.Body.String(), tc.code) {
				t.Fatalf("want %d %s, got %d %s", tc.want, tc.code, rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "NOT_CONFIGURED") {
				t.Fatal("an error was reported as missing configuration")
			}
		})
	}
}

func TestFinancialSetup_ANamedFeeDestinationIsResolvedAndPassedToCore(t *testing.T) {
	core := &fakeReadiness{res: readyCore()}
	own := &readinessParties{party: &service.ResolvedParty{OwnerType: "MERCHANT", OwnerID: "merchant-internal-uuid", AvailableAccountID: "acct-1"}}
	getFinancialSetup(NewFinancialSetupHandler(core, own), devPrincipal("p"), "?fee_destination=@Doa")
	if core.fee == nil || core.fee.Handle != "doa" || core.fee.AccountID != "acct-1" || !core.fee.Owned {
		t.Fatalf("fee = %#v", core.fee)
	}

	stranger := &readinessParties{party: &service.ResolvedParty{OwnerType: "MERCHANT", OwnerID: "someone-else", AvailableAccountID: "acct-2"}}
	getFinancialSetup(NewFinancialSetupHandler(core, stranger), devPrincipal("p"), "?fee_destination=@other")
	if core.fee == nil || core.fee.Owned {
		t.Fatalf("a stranger's account was reported as owned: %#v", core.fee)
	}

	missing := &readinessParties{err: service.ErrNotFound}
	getFinancialSetup(NewFinancialSetupHandler(core, missing), devPrincipal("p"), "?fee_destination=@nobody")
	if core.fee == nil || core.fee.AccountID != "" {
		t.Fatalf("an unresolved handle must reach core unresolved: %#v", core.fee)
	}

	down := &readinessParties{err: &service.TransportError{Err: errors.New("refused")}}
	if rec := getFinancialSetup(NewFinancialSetupHandler(core, down), devPrincipal("p"), "?fee_destination=@doa"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("resolver outage: want 503, got %d", rec.Code)
	}
}
