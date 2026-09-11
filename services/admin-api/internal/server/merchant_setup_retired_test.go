package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/handler"
)

// A5-09. The routes that built a Business outside its lifecycle — create with
// "sandbox": true auto-approving KYB and AML, mint or re-send keys (LIVE, emailed
// in the clear), hand-provision a wallet, hard-delete a merchant with its KYB
// record — answer 410 whoever calls them. Read from the route table, as the
// notification test does: building the router needs a live operator store.
func TestMerchantSetupRoutes_AreRetired(t *testing.T) {
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range []struct{ method, route string }{
		{"Post", "/admin/v1/merchants"},
		{"Delete", "/admin/v1/merchants/{id}"},
		{"Post", "/admin/v1/merchants/{id}/api-keys"},
		{"Post", "/admin/v1/merchants/{id}/resend-credentials"},
		{"Post", "/admin/v1/merchants/{id}/wallets"},
	} {
		re := regexp.MustCompile(`\.` + r.method + `\("` + regexp.QuoteMeta(r.route) + `", (\S+)\)`)
		m := re.FindAllStringSubmatch(string(src), -1)
		if len(m) != 1 || m[0][1] != "handler.RetiredMerchantSetup" {
			t.Fatalf("%s %s is served by %v, want handler.RetiredMerchantSetup", r.method, r.route, m)
		}
	}
	w := httptest.NewRecorder()
	handler.RetiredMerchantSetup(w, httptest.NewRequest(http.MethodPost, "/admin/v1/merchants", nil))
	if w.Code != http.StatusGone {
		t.Fatalf("the retired handler answered %d, want 410", w.Code)
	}
}
