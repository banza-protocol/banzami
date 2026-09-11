package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// A5-13: every core call names the operator acting, so core's audit records a
// person, not the role "ADMIN".
func TestCoreAdminClient_NamesTheActingOperator(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("X-Banzami-Operator")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	ctx := auth.WithPrincipal(context.Background(), auth.Principal{ID: "5f0e1d2c-2222-4b3a-8c9d-0e1f2a3b4c5d"})
	_, _ = NewCoreAdminClient(srv.URL).ApproveMerchant(ctx, "m1")
	if got != "5f0e1d2c-2222-4b3a-8c9d-0e1f2a3b4c5d" {
		t.Fatalf("core was told operator %q", got)
	}
}
