package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Every Gateway→Core request carries CORE_INTERNAL_KEY — not only refunds.
func TestCoreApiClient_SendsTheCoreKeyOnEveryRequest(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("X-Internal-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	c := NewCoreApiClient(srv.URL, "core-key-test")
	var out map[string]any
	_ = c.get(context.Background(), "/internal/v1/wallets/w-1", &out)
	if got != "core-key-test" {
		t.Fatalf("X-Internal-Key = %q", got)
	}
}
