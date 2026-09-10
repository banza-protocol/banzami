package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// ADR-028: whether a Business Account may take an application fee is the class
// an operator gives it. It was a bare setter — no reason, no confirmation, no
// audit — and nothing in the console reached it, so the only way to make an
// application eligible for its own fee was an unaudited internal call. These
// are about the guards, because a class set by accident silently lets fees flow
// somewhere they should not.

func classifyReq(body string) *http.Request {
	return httptest.NewRequest(http.MethodPatch, "/admin/v1/merchants/m-1/business-account-type", strings.NewReader(body))
}

func TestSetBusinessAccountType_ForwardsAndAudits(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"id":"m-1","business_account_type":"MERCHANT"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"m-1","business_account_type":"APPLICATION"}`))
	}
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))
	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPatch, "/admin/v1/merchants/{id}/business-account-type", h.SetBusinessAccountType).
		ServeHTTP(w, classifyReq(`{"business_account_type":"APPLICATION","confirmation_text":"APPLICATION","reason":"application priced on sandbox-reference takes its own fee"}`))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "/internal/v1/merchants/m-1/business-account-type" {
		t.Fatalf("wrong forward path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("expected one audit entry, got %d", len(sink.entries))
	}
	a := sink.entries[0]
	if a.Action != "MERCHANT_BUSINESS_ACCOUNT_TYPE_CHANGED" || a.EntityType != "merchant" || a.EntityID != "m-1" {
		t.Fatalf("unexpected audit: %+v", a)
	}
	if got, _ := json.Marshal(a.Before); string(got) != `{"business_account_type":"MERCHANT"}` {
		t.Fatalf("audit before = %s, want the previous class", got)
	}
	after, _ := json.Marshal(a.After)
	if !strings.Contains(string(after), `"APPLICATION"`) || !strings.Contains(string(after), "takes its own fee") {
		t.Fatalf("audit after must carry the new class and the reason: %s", after)
	}
	assertNoSecret(t, a)
}

func TestSetBusinessAccountType_RefusesWithoutAReason(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))
	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPatch, "/admin/v1/merchants/{id}/business-account-type", h.SetBusinessAccountType).
		ServeHTTP(w, classifyReq(`{"business_account_type":"APPLICATION","confirmation_text":"APPLICATION","reason":" "}`))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "REASON_REQUIRED") {
		t.Fatalf("expected REASON_REQUIRED, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "" {
		t.Fatalf("nothing may reach core without a reason; it saw %s", fc.lastPath)
	}
}

func TestSetBusinessAccountType_RefusesAnUnconfirmedChange(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewMerchantHandler(service.NewCoreAdminClient(fc.srv.URL))
	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPatch, "/admin/v1/merchants/{id}/business-account-type", h.SetBusinessAccountType).
		ServeHTTP(w, classifyReq(`{"business_account_type":"PLATFORM","confirmation_text":"APPLICATION","reason":"typo"}`))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "CONFIRMATION_MISMATCH") {
		t.Fatalf("expected CONFIRMATION_MISMATCH, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "" {
		t.Fatalf("nothing may reach core on a mismatched confirmation; it saw %s", fc.lastPath)
	}
}
