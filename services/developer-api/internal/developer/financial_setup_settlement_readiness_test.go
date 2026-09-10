package developer

// The Console shows a configured project whether it can SETTLE, from the same
// engine and in the same shape a Project key reads at GET /v1/financial-setup.
// A read that fails is reported as unavailable — never as a blocker, and never
// by downgrading a READY setup.

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/developer-api/internal/coreclient"
)

type fakeReadinessReader struct {
	merchant string
	out      *ProjectReadiness
	err      error
}

func (f *fakeReadinessReader) SettlementReadiness(_ context.Context, merchantID string) (*ProjectReadiness, error) {
	f.merchant = merchantID
	return f.out, f.err
}

func TestFinancialSetup_AConfiguredProjectShowsItsSettlementReadiness(t *testing.T) {
	s, _, proj := setupSvc(t)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err != nil {
		t.Fatalf("configure: %v", err)
	}
	want := &ProjectReadiness{}
	want.Settlement.Ready = true
	rr := &fakeReadinessReader{out: want}
	s.SetReadinessReader(rr)

	got, err := s.ProjectFinancialSetup(bg, "u_owner", proj)
	if err != nil {
		t.Fatal(err)
	}
	if got.Readiness != want || got.ReadinessUnavailable {
		t.Fatalf("readiness = %#v unavailable=%v", got.Readiness, got.ReadinessUnavailable)
	}
	if rr.merchant == "" {
		t.Fatal("readiness was not asked about the project's owner")
	}
}

func TestFinancialSetup_AnUnconfiguredProjectAsksCoreNothing(t *testing.T) {
	s, _, proj := setupSvc(t)
	rr := &fakeReadinessReader{out: &ProjectReadiness{}}
	s.SetReadinessReader(rr)
	got, err := s.ProjectFinancialSetup(bg, "u_owner", proj)
	if err != nil {
		t.Fatal(err)
	}
	if got.State != FinancialUnconfigured || got.Readiness != nil || rr.merchant != "" {
		t.Fatalf("state=%s readiness=%#v asked=%q", got.State, got.Readiness, rr.merchant)
	}
}

func TestFinancialSetup_AFailedReadinessReadIsNotABlockerAndNotADowngrade(t *testing.T) {
	s, _, proj := setupSvc(t)
	if _, err := s.ConfigureProjectFinancialSandbox(bg, "u_owner", proj, "", ""); err != nil {
		t.Fatalf("configure: %v", err)
	}
	s.SetReadinessReader(&fakeReadinessReader{err: errors.New("core unavailable")})
	got, err := s.ProjectFinancialSetup(bg, "u_owner", proj)
	if err != nil {
		t.Fatalf("a readiness outage failed the whole setup read: %v", err)
	}
	if got.State != FinancialReady || got.Readiness != nil || !got.ReadinessUnavailable {
		t.Fatalf("state=%s readiness=%#v unavailable=%v", got.State, got.Readiness, got.ReadinessUnavailable)
	}
}

// The projection renders core's answer: handles gain their "@", blockers pass
// through untouched, and no identifier appears.
func TestProjectReadiness_RendersCoresAnswerWithoutIdentifiers(t *testing.T) {
	var cr coreclient.SettlementReadiness
	if err := json.Unmarshal([]byte(`{
	  "financial_identity":{"handle":"doa"},"kyb":{"status":"APPROVED"},
	  "wallet":{"status":"ACTIVE","currency":"AOA","ready":true},
	  "pricing":{"profile":"sandbox-reference","configured":true,"settlement_bps":200,"settlement_flat_minor":0,"payout_bps":75},
	  "fee_destination":{"handle":"doa","required":true,"resolved":true,"owned_by_project":true,"active":true,
	    "kyb_approved":true,"wallet_active":true,"type_allowed":false,"application_account_required":false,
	    "eligible":false,"blocker":"FEE_DESTINATION_TYPE_NOT_ALLOWED"},
	  "settlement":{"ready":false,"blockers":["FEE_DESTINATION_TYPE_NOT_ALLOWED"],"warnings":[]}}`), &cr); err != nil {
		t.Fatal(err)
	}
	pr := projectReadiness(&cr)
	if *pr.FinancialIdentity.Handle != "@doa" || *pr.FeeDestination.Handle != "@doa" {
		t.Errorf("handles = %v %v", *pr.FinancialIdentity.Handle, *pr.FeeDestination.Handle)
	}
	if pr.Settlement.Ready || len(pr.Settlement.Blockers) != 1 || pr.Settlement.Blockers[0] != "FEE_DESTINATION_TYPE_NOT_ALLOWED" {
		t.Errorf("settlement = %#v", pr.Settlement)
	}
	if !pr.FeeDestination.ApplicationAccountReady || *pr.Pricing.SettlementBps != 200 {
		t.Errorf("fee_destination/pricing = %#v %#v", pr.FeeDestination, pr.Pricing)
	}
	raw, _ := json.Marshal(pr)
	for _, k := range []string{"merchant", "wallet_id", "account_id", "binding", "rule_id"} {
		if strings.Contains(string(raw), k) {
			t.Errorf("projection carries %q: %s", k, raw)
		}
	}
}
