package coreclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Provisioning and refund-side reads carry CORE_INTERNAL_KEY; the refund call
// keeps its own dedicated key.
func TestClients_SendTheCoreKey(t *testing.T) {
	seen := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen[r.Method+" "+r.URL.Path] = r.Header.Get("X-Internal-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	_, _, _ = NewProvision(srv.URL).WithInternalKey("core-key-test").ProvisionSandboxReadiness(context.Background(), "m-1", "p-1")
	rc := NewRefund(srv.URL, "refund-key-test").WithInternalKey("core-key-test")
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/internal/v1/payment-sessions/s-1", nil)
	_, _ = rc.http.Do(req)
	req, _ = http.NewRequest(http.MethodPost, srv.URL+"/internal/v1/refunds", nil)
	req.Header.Set("X-Internal-Key", rc.refundKey)
	_, _ = rc.http.Do(req)
	if seen["POST /internal/v1/sandbox/business-readiness"] != "core-key-test" {
		t.Fatalf("provision: %v", seen)
	}
	if seen["GET /internal/v1/payment-sessions/s-1"] != "core-key-test" {
		t.Fatalf("session read: %v", seen)
	}
	if seen["POST /internal/v1/refunds"] != "refund-key-test" {
		t.Fatalf("the dedicated refund key was replaced: %v", seen)
	}
}
