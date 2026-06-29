package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

func TestPricingProfile_CreateForwardsAndAudits(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"pp-1","code":"STANDARD"}`))
	}
	h := NewPricingProfileHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/finance/pricing-profiles", h.Create).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/finance/pricing-profiles",
			strings.NewReader(`{"code":"STANDARD","name":"Standard","environment":"LIVE"}`)))

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "/internal/v1/pricing-profiles" {
		t.Fatalf("wrong forward path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 || sink.entries[0].Action != "CREATE_PRICING_PROFILE" ||
		sink.entries[0].EntityType != "pricing_profile" || sink.entries[0].EntityID != "pp-1" {
		t.Fatalf("unexpected audit: %+v", sink.entries)
	}
	assertNoSecret(t, sink.entries[0])
}

func TestFeePolicy_DisableForwardsToFeePoliciesPath(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"fp-1","enabled":false}`))
	}
	h := NewFeePolicyHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/finance/fee-policies/{id}/disable", h.Disable).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/finance/fee-policies/fp-1/disable", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if fc.lastPath != "/internal/v1/fee-policies/fp-1/disable" {
		t.Fatalf("wrong forward path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 || sink.entries[0].Action != "DISABLE_FEE_POLICY" ||
		sink.entries[0].EntityType != "fee_policy" {
		t.Fatalf("unexpected audit: %+v", sink.entries)
	}
}

func TestPricingCatalog_ListWhitelistsFilters(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"data":[]}`)) }
	h := NewPricingProfileHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		"/admin/v1/finance/pricing-profiles?environment=LIVE&status=enabled&evil=x", nil)
	auditedRoute(&annSink{}, http.MethodGet, "/admin/v1/finance/pricing-profiles", h.List).ServeHTTP(w, req)

	if !strings.Contains(fc.lastPath, "environment=LIVE") || !strings.Contains(fc.lastPath, "status=enabled") {
		t.Fatalf("filters not forwarded: %s", fc.lastPath)
	}
	if strings.Contains(fc.lastPath, "evil") {
		t.Fatalf("non-whitelisted param leaked: %s", fc.lastPath)
	}
}
