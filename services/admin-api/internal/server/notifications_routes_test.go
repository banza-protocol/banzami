package server

import (
	"os"
	"regexp"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// Operator notifications are GLOBAL: marking one read or dismissing it hides it
// for every operator. Those two routes were gated by dashboard.view, which
// READ_ONLY and SUPPORT hold — an observer could clear the desk's queue. They
// now need a desk capability (application.process: the triage work that
// decides nothing), which the roles that work the queue hold and observers do
// not. Reading the list stays dashboard.view.
//
// Read from the route table itself, as TestNoInsertCreatesAnActiveOperator
// reads SQL: the capability is a closure argument and cannot be inspected on a
// built router, and building one needs a live operator store.
func TestNotificationMutations_NeedADeskCapability(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatalf("read server.go: %v", err)
	}
	// Every capability a route may name, by its identifier in server.go.
	caps := map[string]auth.Capability{
		"CapDashboardView": auth.CapDashboardView, "CapOperatorRead": auth.CapOperatorRead,
		"CapApplicationView": auth.CapApplicationView, "CapMerchantView": auth.CapMerchantView,
		"CapConsumerView": auth.CapConsumerView, "CapSettlementView": auth.CapSettlementView,
		"CapPayoutView": auth.CapPayoutView, "CapReconView": auth.CapReconView,
		"CapDisputeView": auth.CapDisputeView, "CapRiskView": auth.CapRiskView,
		"CapAuditView": auth.CapAuditView, "CapPricingView": auth.CapPricingView,
		"CapFinanceView": auth.CapFinanceView, "CapApplicationProcess": auth.CapApplicationProcess,
		"CapApplicationApprove": auth.CapApplicationApprove, "CapApplicationReject": auth.CapApplicationReject,
		"CapComplianceReview": auth.CapComplianceReview, "CapOperatorManage": auth.CapOperatorManage,
	}
	routeCap := func(method, route string) auth.Capability {
		t.Helper()
		re := regexp.MustCompile(`r\.With\(cap\(auth\.(\w+)\)\)\.` + method + `\("` + regexp.QuoteMeta(route) + `"`)
		m := re.FindAllStringSubmatch(string(src), -1)
		if len(m) != 1 {
			t.Fatalf("%s %s: want exactly one capability-gated route, found %d", method, route, len(m))
		}
		c, ok := caps[m[0][1]]
		if !ok {
			t.Fatalf("%s %s: capability %s is not one this test knows — add it to the map", method, route, m[0][1])
		}
		return c
	}

	for _, route := range []string{"/admin/v1/notifications/{id}/read", "/admin/v1/notifications/{id}/dismiss"} {
		c := routeCap("Post", route)
		for _, observer := range []string{"READ_ONLY", "SUPPORT"} {
			if auth.Can(observer, c) {
				t.Errorf("POST %s is gated by %q, which %s holds — an observer could hide a global notification from everyone", route, c, observer)
			}
		}
		for _, desk := range []string{"OPERATIONS", "COMPLIANCE", auth.RoleSuperAdmin} {
			if !auth.Can(desk, c) {
				t.Errorf("POST %s is gated by %q, which %s lacks — the desk could no longer triage its queue", route, c, desk)
			}
		}
	}

	list := routeCap("Get", "/admin/v1/notifications")
	for _, role := range []string{"READ_ONLY", "SUPPORT", "OPERATIONS", "COMPLIANCE"} {
		if !auth.Can(role, list) {
			t.Errorf("GET /admin/v1/notifications is gated by %q, which %s lacks — every operator may read the list", list, role)
		}
	}
}
