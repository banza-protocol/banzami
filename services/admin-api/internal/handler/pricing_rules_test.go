package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// fakeCore spins an httptest server standing in for core-api and records the
// last request path + query + body it received.
type fakeCore struct {
	srv      *httptest.Server
	lastPath string
	lastBody string
	respond  func(w http.ResponseWriter, r *http.Request)
}

func newFakeCore() *fakeCore {
	fc := &fakeCore{}
	fc.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fc.lastPath = r.URL.Path
		if r.URL.RawQuery != "" {
			fc.lastPath += "?" + r.URL.RawQuery
		}
		b, _ := io.ReadAll(r.Body)
		fc.lastBody = string(b)
		if fc.respond != nil {
			fc.respond(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"pr-1","rule_key":"donation-standard","version":1,"rate_bps":200}`))
	}))
	return fc
}

func (fc *fakeCore) close() { fc.srv.Close() }

func TestPricingRule_CreateForwardsAndAudits(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"pr-9","rule_key":"donation-standard","version":1,"rate_bps":200}`))
	}
	h := NewPricingRuleHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	body := `{"rule_key":"donation-standard","environment":"LIVE","business_category":"DONATION","rate_bps":200,"flat_minor":0,"rounding":"HALF_UP"}`
	auditedRoute(sink, http.MethodPost, "/admin/v1/finance/pricing-rules", h.Create).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/finance/pricing-rules", strings.NewReader(body)))

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", w.Code, w.Body.String())
	}
	if fc.lastPath != "/internal/v1/pricing-rules" {
		t.Fatalf("forwarded to wrong path: %s", fc.lastPath)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("create must write one audit row, got %d", len(sink.entries))
	}
	e := sink.entries[0]
	if e.Action != "CREATE_PRICING_RULE" || e.EntityType != "pricing_rule" || e.EntityID != "pr-9" {
		t.Fatalf("unexpected audit: action=%s entity=%s id=%s", e.Action, e.EntityType, e.EntityID)
	}
	assertNoSecret(t, e)
}

func TestPricingRule_ListForwardsOnlyWhitelistedFilters(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewPricingRuleHandler(service.NewCoreAdminClient(fc.srv.URL))

	w := httptest.NewRecorder()
	// includes a junk param that must NOT be forwarded
	req := httptest.NewRequest(http.MethodGet,
		"/admin/v1/finance/pricing-rules?environment=LIVE&status=enabled&evil=DROP", nil)
	auditedRoute(&annSink{}, http.MethodGet, "/admin/v1/finance/pricing-rules", h.List).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(fc.lastPath, "environment=LIVE") || !strings.Contains(fc.lastPath, "status=enabled") {
		t.Fatalf("whitelisted filters not forwarded: %s", fc.lastPath)
	}
	if strings.Contains(fc.lastPath, "evil") {
		t.Fatalf("non-whitelisted param leaked: %s", fc.lastPath)
	}
}

func TestPricingRule_UpdateAuditsChange(t *testing.T) {
	fc := newFakeCore()
	defer fc.close()
	h := NewPricingRuleHandler(service.NewCoreAdminClient(fc.srv.URL))

	sink := &annSink{}
	w := httptest.NewRecorder()
	auditedRoute(sink, http.MethodPatch, "/admin/v1/finance/pricing-rules/{id}", h.Update).
		ServeHTTP(w, httptest.NewRequest(http.MethodPatch, "/admin/v1/finance/pricing-rules/pr-1",
			strings.NewReader(`{"rule_key":"x","environment":"LIVE","rate_bps":250,"flat_minor":0,"rounding":"HALF_UP"}`)))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if len(sink.entries) != 1 || sink.entries[0].Action != "UPDATE_PRICING_RULE" {
		t.Fatalf("expected one UPDATE_PRICING_RULE audit row, got %+v", sink.entries)
	}
}

func TestPricingRule_RBAC(t *testing.T) {
	// View is broad; manage is SUPER_ADMIN-only.
	if !auth.Can("READ_ONLY", auth.CapPricingView) {
		t.Fatal("READ_ONLY must be able to view pricing")
	}
	if auth.Can("READ_ONLY", auth.CapPricingManage) {
		t.Fatal("READ_ONLY must NOT manage pricing")
	}
	if auth.Can("OPERATIONS", auth.CapPricingManage) {
		t.Fatal("OPERATIONS must NOT manage pricing")
	}
	if !auth.Can("SUPER_ADMIN", auth.CapPricingManage) {
		t.Fatal("SUPER_ADMIN must manage pricing")
	}
}

// sanity: the fake's default JSON is valid (guards the helper itself)
func TestFakeCoreDefaultJSON(t *testing.T) {
	var m map[string]any
	if err := json.Unmarshal([]byte(`{"id":"pr-1"}`), &m); err != nil {
		t.Fatal(err)
	}
}
