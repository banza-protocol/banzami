package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A6-07. Unauthenticated reads served internal ids — the Business's merchant,
// wallet and campaign account on a payment link; the receiver's and the payer's
// consumer ids, the transfer and the receiver's private name on a consumer's
// request. Anyone with a link now sees what paying needs, and a consumer by
// @banza only.
func TestPublicReads_CarryNoInternalIds(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/internal/v1/payment-links/by-slug/"):
			_, _ = w.Write([]byte(`{"id":"LINKID","slug":"abcdef012345","merchant_id":"MERCHANTID","wallet_id":"WALLETID","wallet_account_id":"ACCOUNTID","amount_minor":2000,"currency":"AOA","status":"ACTIVE","created_at":"2026-09-11T00:00:00Z","updated_at":"2026-09-11T00:00:00Z"}`))
		default:
			_, _ = w.Write([]byte(`{"id":"REQID","link_code":"ABCD2345","receiver_consumer_id":"RECEIVERID","receiver_handle":"ana","receiver_display_name":"Ana Maria Private","payer_consumer_id":"PAYERID","transfer_id":"TRANSFERID","currency":"AOA","locked":true,"status":"PAID","created_at":"2026-09-11T00:00:00Z"}`))
		}
	}))
	defer core.Close()
	client := service.NewCorePublicClient(core.URL)

	get := func(h http.HandlerFunc, param, value string) string {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add(param, value)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		w := httptest.NewRecorder()
		h(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
		return w.Body.String()
	}

	link := get(NewPaymentLinkHandler(client, nil, nil, "SANDBOX").GetBySlug, "slug", "abcdef012345")
	for _, leak := range []string{"LINKID", "MERCHANTID", "WALLETID", "ACCOUNTID"} {
		if strings.Contains(link, leak) {
			t.Fatalf("the public payment link carries %s: %s", leak, link)
		}
	}
	if !strings.Contains(link, `"slug":"abcdef012345"`) || !strings.Contains(link, `"amount_minor":2000`) {
		t.Fatalf("the public payment link lost what paying needs: %s", link)
	}

	req := get(NewConsumerPayLinkHandler(client, nil, nil).GetByCode, "code", "ABCD2345")
	for _, leak := range []string{"REQID", "RECEIVERID", "PAYERID", "TRANSFERID", "Ana Maria Private"} {
		if strings.Contains(req, leak) {
			t.Fatalf("the public payment request carries %s: %s", leak, req)
		}
	}
	if !strings.Contains(req, `"receiver_handle":"ana"`) {
		t.Fatalf("the public payment request lost the receiver's @banza: %s", req)
	}
}
