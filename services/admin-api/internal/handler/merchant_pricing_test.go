package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// Changing what a customer is charged is the operator's one commercial decision
// about that customer, and until this route existed the operator console could
// not make it — it could set a Business Account's verified flag and its account
// type, but not its price. The core route was there; nothing reached it.
//
// So these are about the guards, not the plumbing. A rate changed by accident
// does not show up in any balance: it shows up when an invoice is wrong.

func pricingReq(body string) *http.Request {
	return httptest.NewRequest(http.MethodPut, "/admin/v1/merchants/m-1/pricing-profile", strings.NewReader(body))
}

func TestAssignPricingProfile_ForwardsAndAudits(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			// The before-state read, so the audit row can say what it changed from.
			_, _ = w.Write([]byte(`{"id":"m-1","pricing_profile_id":"old-profile"}`))
			return
		}
		_, _ = w.Write([]byte(`{"merchant_id":"m-1","profile_code":"sandbox-reference"}`))
	}
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPut, "/admin/v1/merchants/{id}/pricing-profile", h.AssignPricingProfile).
		ServeHTTP(w, pricingReq(`{"profile_code":"sandbox-reference","confirmation_text":"sandbox-reference","reason":"reference plan for the DOA integration"}`))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "/internal/v1/merchants/m-1/pricing-profile" {
		t.Fatalf("wrong forward path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("expected one audit entry, got %d", len(sink.entries))
	}
	a := sink.entries[0]
	if a.Action != "MERCHANT_PRICING_PROFILE_ASSIGNED" || a.EntityType != "merchant" || a.EntityID != "m-1" {
		t.Fatalf("unexpected audit: %+v", a)
	}
	// Both halves matter: which price it was on, and why someone moved it.
	if got, _ := json.Marshal(a.Before); string(got) != `{"pricing_profile_id":"old-profile"}` {
		t.Fatalf("audit before = %s, want the previous profile", got)
	}
	after, _ := json.Marshal(a.After)
	if !strings.Contains(string(after), "reference plan for the DOA integration") {
		t.Fatalf("audit after must carry the reason: %s", after)
	}
	assertNoSecret(t, a)
}

func TestAssignPricingProfile_RefusesWithoutAReason(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPut, "/admin/v1/merchants/{id}/pricing-profile", h.AssignPricingProfile).
		ServeHTTP(w, pricingReq(`{"profile_code":"sandbox-reference","confirmation_text":"sandbox-reference","reason":"   "}`))

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "REASON_REQUIRED") {
		t.Fatalf("expected REASON_REQUIRED, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "" {
		t.Fatalf("nothing may reach core when the request is refused, got %s", fc.lastPath)
	}
}

func TestAssignPricingProfile_RefusesAMistypedConfirmation(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPut, "/admin/v1/merchants/{id}/pricing-profile", h.AssignPricingProfile).
		ServeHTTP(w, pricingReq(`{"profile_code":"sandbox-reference","confirmation_text":"sandbox-default","reason":"typo"}`))

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "CONFIRMATION_MISMATCH") {
		t.Fatalf("expected CONFIRMATION_MISMATCH, got %d (%s)", w.Code, w.Body.String())
	}
	// The specific accident this guards against: the operator has two profiles
	// open, means one and types the other. Nothing must move.
	if fc.lastPath != "" {
		t.Fatalf("a mistyped confirmation must not reach core, got %s", fc.lastPath)
	}
}

func TestAssignPricingProfile_RefusesAnEmptyProfileCode(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPut, "/admin/v1/merchants/{id}/pricing-profile", h.AssignPricingProfile).
		ServeHTTP(w, pricingReq(`{"profile_code":"  ","confirmation_text":"  ","reason":"why"}`))

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "MISSING_FIELD") {
		t.Fatalf("expected MISSING_FIELD, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "" {
		t.Fatalf("an empty code must not reach core, got %s", fc.lastPath)
	}
}
