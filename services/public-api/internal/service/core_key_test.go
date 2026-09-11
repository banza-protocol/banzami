package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Every request to Core carries CORE_INTERNAL_KEY: Core refuses /internal
// requests without it.
func TestCorePublicClient_SendsTheCoreKey(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("X-Internal-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"c-1","handle":"x","status":"ACTIVE"}`))
	}))
	defer srv.Close()
	_, _ = NewCorePublicClient(srv.URL).WithInternalKey("core-key-test").GetConsumer(context.Background(), "c-1")
	if got != "core-key-test" {
		t.Fatalf("X-Internal-Key = %q", got)
	}
}
