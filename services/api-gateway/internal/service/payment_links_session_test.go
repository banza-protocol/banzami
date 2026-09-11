package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// SessionStatus asks core which Payment Session owns the link, by the link id,
// and reports its status; a link that belongs to no session is "".
func TestPaymentLinkSessionStatus(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/internal/v1/payment-sessions/by-interface/link/22222222-2222-4222-8222-222222222222" {
			_, _ = w.Write([]byte(`{"session_id":"s1","status":"PAID"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"NOT_FOUND","message":"no session"}}`))
	}))
	t.Cleanup(srv.Close)
	svc := NewCoreApiPaymentLinkService(NewCoreApiClient(srv.URL, ""))

	status, err := svc.SessionStatus(context.Background(), "22222222-2222-4222-8222-222222222222")
	if err != nil || status != "PAID" {
		t.Fatalf("SessionStatus = %q, %v; want PAID (path %s)", status, err, gotPath)
	}

	status, err = svc.SessionStatus(context.Background(), "33333333-3333-4333-8333-333333333333")
	if err != nil || status != "" {
		t.Fatalf("a link with no session: %q, %v; want \"\", nil", status, err)
	}
}
