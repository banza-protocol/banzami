package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

func TestOperatorFees_ListForwardsWhitelistedFilters(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}
	h := NewFinanceAuditHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		"/admin/v1/finance/operator-fees?currency=AOA&business_category=DONATION&evil=x", nil)
	auditedRoute(&annSink{}, http.MethodGet, "/admin/v1/finance/operator-fees", h.ListOperatorFees).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.HasPrefix(fc.lastPath, "/internal/v1/operator-fees") ||
		!strings.Contains(fc.lastPath, "currency=AOA") || !strings.Contains(fc.lastPath, "business_category=DONATION") {
		t.Fatalf("filters not forwarded: %s", fc.lastPath)
	}
	if strings.Contains(fc.lastPath, "evil") {
		t.Fatalf("non-whitelisted param leaked: %s", fc.lastPath)
	}
}

func TestDashboard_ForwardsWhitelistedFiltersNoAudit(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"operator_fees":{},"application_settlements":{}}`))
	}
	h := NewFinanceAuditHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		"/admin/v1/finance/dashboard?environment=LIVE&currency=AOA&evil=x", nil)
	auditedRoute(sink, http.MethodGet, "/admin/v1/finance/dashboard", h.Dashboard).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.HasPrefix(fc.lastPath, "/internal/v1/finance/dashboard") ||
		!strings.Contains(fc.lastPath, "environment=LIVE") || !strings.Contains(fc.lastPath, "currency=AOA") {
		t.Fatalf("filters not forwarded: %s", fc.lastPath)
	}
	if strings.Contains(fc.lastPath, "evil") {
		t.Fatalf("non-whitelisted param leaked: %s", fc.lastPath)
	}
	if len(sink.entries) != 0 {
		t.Fatalf("a GET dashboard must not write an audit row, got %d", len(sink.entries))
	}
}

func TestSettlement_CancelAudits(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"as-1","status":"CANCELLED"}`))
	}
	h := NewFinanceAuditHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPost, "/admin/v1/finance/application-settlements/{id}/cancel", h.CancelSettlement).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/finance/application-settlements/as-1/cancel", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "/internal/v1/application-settlements/as-1/cancel" {
		t.Fatalf("wrong forward path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 || sink.entries[0].Action != "CANCEL_APPLICATION_SETTLEMENT" ||
		sink.entries[0].EntityType != "application_settlement" {
		t.Fatalf("unexpected audit: %+v", sink.entries)
	}
	assertNoSecret(t, sink.entries[0])
}

func TestSettlement_FailRequiresReason(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewFinanceAuditHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPost, "/admin/v1/finance/application-settlements/{id}/fail", h.FailSettlement).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/finance/application-settlements/as-1/fail", strings.NewReader(`{}`)))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("fail without reason must be 400, got %d", w.Code)
	}
}

func TestFinance_RBAC(t *testing.T) {
	if !auth.Can("READ_ONLY", auth.CapFinanceView) {
		t.Fatal("READ_ONLY must view finance")
	}
	if auth.Can("READ_ONLY", auth.CapFinanceManage) {
		t.Fatal("READ_ONLY must NOT manage finance")
	}
	if auth.Can("OPERATIONS", auth.CapFinanceManage) {
		t.Fatal("OPERATIONS must NOT manage finance")
	}
	if !auth.Can("SUPER_ADMIN", auth.CapFinanceManage) {
		t.Fatal("SUPER_ADMIN must manage finance")
	}
}
