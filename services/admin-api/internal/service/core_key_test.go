package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Every request to Core carries CORE_INTERNAL_KEY: Core refuses /internal
// requests without it.
func TestCoreAdminClient_SendsTheCoreKey(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("X-Internal-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	_, _ = NewCoreAdminClient(srv.URL).WithInternalKey("core-key-test").GetMerchantCompliance(context.Background(), "m-1")
	if got != "core-key-test" {
		t.Fatalf("X-Internal-Key = %q", got)
	}
}
