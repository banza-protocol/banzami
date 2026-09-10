package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// The fee DESTINATION must not depend on a field the pricing model ignores.
//
// The rate is chosen by the merchant's assigned pricing profile; a caller-supplied
// application_fee_bps is deliberately ignored for pricing, and the handler says so
// in a comment. But the destination was resolved only `if body.ApplicationFeeBps > 0`,
// so an integrator who followed the documented model — name the destination, let the
// operator's profile set the rate — had the fee account silently dropped. Core then
// refused with "application_fee_account_id is required for this category", naming a
// field the public contract never asks for.
//
// This is the deployed DOA failure: @doa named, no bps sent, settlement impossible.
func TestApplicationSettlement_FeeDestinationResolvedWithoutCallerBps(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, &fakeParties{}, pricedFake())

	// No application_fee_bps at all — exactly what the documented model produces.
	body := `{"idempotency_key":"idem-1","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","fee_destination_banza_name":"doa",
	          "reference_id":"ref-1"}`
	rec := postBusiness(h, "doa-merchant", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fs.lastInput.ApplicationFeeAccountID != "acct-doa" {
		t.Fatalf("fee destination was named but not resolved: fee_account=%q",
			fs.lastInput.ApplicationFeeAccountID)
	}
}

// Naming no destination stays legal: a profile that charges nothing needs none.
func TestApplicationSettlement_NoDestinationNamedStillSettles(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, &fakeParties{}, pricedFake())
	body := `{"idempotency_key":"idem-2","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","reference_id":"ref-2"}`
	rec := postBusiness(h, "doa-merchant", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fs.lastInput.ApplicationFeeAccountID != "" {
		t.Fatalf("no destination was named; none should be resolved, got %q",
			fs.lastInput.ApplicationFeeAccountID)
	}
}

// A destination that is not the caller's own account is still refused. Resolving
// the destination more often must not resolve it more loosely.
func TestApplicationSettlement_ForeignFeeDestinationStillRefused(t *testing.T) {
	// Owned by somebody else, and named WITHOUT bps — the path this change widened.
	parties := &fakeParties{ownerType: "MERCHANT", ownerID: "someone-else"}
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, parties, pricedFake())
	body := `{"idempotency_key":"idem-3","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","fee_destination_banza_name":"stranger",
	          "reference_id":"ref-3"}`
	rec := postBusiness(h, "doa-merchant", body)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a stranger's account must not take this caller's fee: got %d (%s)",
			rec.Code, rec.Body.String())
	}
}

// rejectingSettlements stands in for core refusing the REQUEST rather than failing.
type rejectingSettlements struct{ err error }

func (r *rejectingSettlements) Create(ctx context.Context, in service.CreateApplicationSettlementInput) (*service.ApplicationSettlement, error) {
	return nil, r.err
}
func (r *rejectingSettlements) Complete(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	return nil, r.err
}
func (r *rejectingSettlements) Get(ctx context.Context, id string) (*service.ApplicationSettlement, error) {
	return nil, r.err
}

// A deliberate core 4xx must reach the caller as a 4xx carrying its reason.
//
// It was answered with 502 UPSTREAM_ERROR "could not create settlement", which
// tells an integrator that Banzami broke — when in fact core had named the exact
// thing to fix. Worse, a 502 on this path reached the browser with no usable body
// at all, so the deployed symptom was an opaque network failure.
func TestApplicationSettlement_CoreClientErrorKeepsItsStatusAndReason(t *testing.T) {
	core := &service.CoreError{Status: http.StatusBadRequest, Code: "BAD_REQUEST",
		Message: "application_fee_account_id is required for this category"}
	h := NewApplicationSettlementHandler(&rejectingSettlements{err: core},
		&fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 100000},
		&fakeParties{}, pricedFake())
	body := `{"idempotency_key":"idem-4","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","reference_id":"ref-4"}`
	rec := postBusiness(h, "doa-merchant", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a core 400 must stay a 400, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "application_fee_account_id") {
		t.Fatalf("the actionable reason must reach the caller, got %s", rec.Body.String())
	}
}

// A core 5xx or a transport failure is NOT the caller's fault and must stay 502.
func TestApplicationSettlement_CoreServerErrorStaysBadGateway(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
	}{
		{"core 5xx", &service.CoreError{Status: http.StatusInternalServerError}},
		{"transport", &service.TransportError{Err: errors.New("connection refused")}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := NewApplicationSettlementHandler(&rejectingSettlements{err: tc.err},
				&fakeWallets{merchantID: "doa-merchant"}, &fakeWalletAccounts{balance: 100000},
				&fakeParties{}, pricedFake())
			body := `{"idempotency_key":"idem-5","source_account_id":"acct-campaign",
			          "beneficiary_banza_name":"maria","reference_id":"ref-5"}`
			rec := postBusiness(h, "doa-merchant", body)
			if rec.Code != http.StatusBadGateway {
				t.Fatalf("want 502, got %d", rec.Code)
			}
			// The caller must not be told its own request was bad.
			if strings.Contains(rec.Body.String(), "connection refused") {
				t.Fatalf("upstream detail leaked: %s", rec.Body.String())
			}
		})
	}
}

// The rate belongs to the operator, not to the caller.
//
// core treated a non-zero application_fee_bps as ADR-029's app-defined path and
// did not consult pricing at all, so a caller could set its own rate. The field
// is gone from the contract, and a request that still carries it — or any other
// way of choosing a tariff — is refused out loud. Silently ignoring it would
// leave an integration believing it set a price it did not.
func TestApplicationSettlement_CallerPricingFieldsAreRefused(t *testing.T) {
	for _, field := range []string{
		`"application_fee_bps":500`, `"applicationFeeBps":500`, `"fee_bps":1`, `"rate_bps":0`,
		`"pricing_profile":"sandbox-default"`, `"business_category":"DONATION"`,
		`"fee_policy_ref":"cheap"`, `"application_fee_minor":1`, `"fee_minor":0`,
	} {
		fs := &fakeSettlements{}
		h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"},
			&fakeWalletAccounts{balance: 100000}, &fakeParties{}, pricedFake())
		body := `{"idempotency_key":"idem-p","source_account_id":"acct-campaign",
		          "beneficiary_banza_name":"maria","fee_destination_banza_name":"doa",
		          ` + field + `,"reference_id":"ref-p"}`
		rec := postBusiness(h, "doa-merchant", body)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "PRICING_FIELD_NOT_ACCEPTED") {
			t.Fatalf("%s: want 400 PRICING_FIELD_NOT_ACCEPTED, got %d (%s)", field, rec.Code, rec.Body.String())
		}
		if fs.created != 0 {
			t.Fatalf("%s: a request that tried to choose its price reached core", field)
		}
	}
}

// Without any pricing field the same request settles, priced by the operator.
func TestApplicationSettlement_ARequestWithoutPricingSettlesAtTheProfileRate(t *testing.T) {
	fs := &fakeSettlements{}
	h := NewApplicationSettlementHandler(fs, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, &fakeParties{}, pricedFake())
	body := `{"idempotency_key":"idem-ok","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","fee_destination_banza_name":"doa","reference_id":"ref-ok"}`
	if rec := postBusiness(h, "doa-merchant", body); rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if fs.lastInput.PricingProfile == "" {
		t.Fatal("the merchant's assigned pricing profile must be what prices this")
	}
	if fs.lastInput.ApplicationFeeAccountID != "acct-doa" {
		t.Fatal("the named fee destination must still be resolved")
	}
}

// A resolver that cannot answer is an outage. Reporting it as an unknown @banza
// sends an integrator to check a handle that is fine, and settles nothing.
func TestApplicationSettlement_AResolverOutageIsNotAnUnknownHandle(t *testing.T) {
	down := &fakeParties{err: &service.TransportError{Err: errors.New("connection refused")}}
	h := NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, down, pricedFake())
	body := `{"idempotency_key":"idem-o","source_account_id":"acct-campaign",
	          "beneficiary_banza_name":"maria","fee_destination_banza_name":"doa","reference_id":"ref-o"}`
	rec := postBusiness(h, "doa-merchant", body)
	if rec.Code != http.StatusServiceUnavailable || strings.Contains(rec.Body.String(), "NOT_FOUND") {
		t.Fatalf("want 503 without NOT_FOUND, got %d %s", rec.Code, rec.Body.String())
	}

	missing := &fakeParties{err: service.ErrNotFound}
	h = NewApplicationSettlementHandler(&fakeSettlements{}, &fakeWallets{merchantID: "doa-merchant"},
		&fakeWalletAccounts{balance: 100000}, missing, pricedFake())
	if rec := postBusiness(h, "doa-merchant", body); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an unknown @banza stays 422, got %d %s", rec.Code, rec.Body.String())
	}
}
