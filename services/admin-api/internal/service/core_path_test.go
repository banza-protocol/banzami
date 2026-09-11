package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// An operator's action is the route its capability names. The merchant id in
// POST /admin/v1/compliance/merchants/{id}/approve was pasted into core's URL
// unescaped, so an id carrying "/../" or "?" reached a different core route or
// rewrote the query (A3-01's class, on the operator side). Every segment is now
// escaped and a reshaped path is never sent.
func TestCoreAdminClient_AnIdentifierCannotChooseTheRoute(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.URL.EscapedPath()+"?"+r.URL.RawQuery)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	c := NewCoreAdminClient(srv.URL)

	_, _ = c.ApproveMerchant(context.Background(), "x/../../../risk/freeze/MERCHANT/v")
	_, _ = c.ApproveMerchant(context.Background(), "x?merchant_id=victim")

	mu.Lock()
	defer mu.Unlock()
	for _, p := range seen {
		if !strings.HasPrefix(p, "/internal/v1/compliance/merchants/") || !strings.Contains(p, "/approve?") ||
			strings.Count(p, "/") != 6 {
			t.Fatalf("an operator-supplied id reshaped the core path: %s", p)
		}
	}
}
