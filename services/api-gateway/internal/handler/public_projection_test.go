package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type profileSvc struct{}

func (profileSvc) GetByHandle(context.Context, string) (*service.MerchantProfile, error) {
	w := "WALLETID"
	return &service.MerchantProfile{ID: "PROFILEID", MerchantID: "MERCHANTID", Handle: "loja", DisplayName: "Loja", WalletID: &w, Public: true}, nil
}

type payLinkSvc struct{}

func (payLinkSvc) GetByCode(context.Context, string) (*service.ConsumerPayLink, error) {
	n := "Ana Maria Private"
	return &service.ConsumerPayLink{ID: "REQID", LinkCode: "ABCD2345", ReceiverConsumerID: "RECEIVERID", ReceiverHandle: "ana", ReceiverDisplayName: &n, Currency: "AOA", Status: "ACTIVE"}, nil
}

// A6-07. The gateway's public profile and payment-request reads carried the
// Business's merchant and wallet ids, and a consumer's id and private name.
func TestGatewayPublicReads_CarryNoInternalIds(t *testing.T) {
	get := func(h http.HandlerFunc, param, value string) string {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add(param, value)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		w := httptest.NewRecorder()
		h(w, req)
		return w.Body.String()
	}
	prof := get(NewMerchantProfileHandler(profileSvc{}).GetPublic, "handle", "loja")
	req := get(NewConsumerPayLinkHandler(payLinkSvc{}).GetPublic, "code", "ABCD2345")
	for body, leaks := range map[string][]string{
		prof: {"PROFILEID", "MERCHANTID", "WALLETID"},
		req:  {"REQID", "RECEIVERID", "Ana Maria Private"},
	} {
		for _, l := range leaks {
			if strings.Contains(body, l) {
				t.Fatalf("a public read carries %s: %s", l, body)
			}
		}
	}
	if !strings.Contains(prof, `"handle":"loja"`) || !strings.Contains(req, `"receiver_handle":"ana"`) {
		t.Fatalf("a public read lost its public identity: %s / %s", prof, req)
	}
}
