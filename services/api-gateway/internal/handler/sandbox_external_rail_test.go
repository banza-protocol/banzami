package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// ADR-061 at the developer surface: a Business's simulated external rail going
// down does not touch a payment from a test payer's wallet — the gateway does not
// even ask — while a payment that stands in for crossing an external rail
// (simulate) fails closed with nothing moved.
//
// Mutation: make PayAsTestPayer read the rail for every payment and
// TestSandboxRail_AWalletPaymentNeverAsksTheRail fails; drop the rail check for
// simulate and TestSandboxRail_ARailDependentPaymentFailsClosed fails.

type fakeRails struct {
	mu    sync.Mutex
	state map[string]string
	reads int
}

func (f *fakeRails) GetSandboxExternalRail(_ context.Context, merchantID string) (*service.SandboxExternalRail, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	s := f.state[merchantID]
	if s == "" {
		s = "AVAILABLE"
	}
	return &service.SandboxExternalRail{State: s, Simulated: true}, nil
}

func (f *fakeRails) SetSandboxExternalRail(_ context.Context, merchantID, state string) (*service.SandboxExternalRail, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.state == nil {
		f.state = map[string]string{}
	}
	f.state[merchantID] = state
	return &service.SandboxExternalRail{State: state, Simulated: true}, nil
}

func railRouter(h *SandboxDevHandler, p *middleware.DeveloperPrincipal) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p)))
		})
	})
	r.Get("/v1/sandbox/external-rail", h.ExternalRail)
	r.Put("/v1/sandbox/external-rail", h.SetExternalRail)
	r.Post("/v1/sandbox/test-payers/{id}/payments", h.PayAsTestPayer)
	return r
}

func put(t *testing.T, h http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func railDown(t *testing.T) (*upstream, *fakeRails, http.Handler) {
	t.Helper()
	up := newUpstream(t)
	rails := &fakeRails{}
	sessions := sbxSessions{"own": {SessionID: "own", MerchantID: "merchant-A", PaymentLinkSlug: slug("s-own")}}
	h := NewSandboxDevHandler(up.srv.URL, "ik", sessions, sbxLinks{}).WithExternalRails(rails)
	router := railRouter(h, principalA())
	if rec := put(t, router, "/v1/sandbox/external-rail", `{"state":"UNAVAILABLE"}`); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"UNAVAILABLE"`) {
		t.Fatalf("take the rail down: %d %s", rec.Code, rec.Body)
	}
	if rails.state["merchant-A"] != "UNAVAILABLE" {
		t.Fatalf("the rail of the key's own Business was not the one set: %v", rails.state)
	}
	return up, rails, router
}

func TestSandboxRail_AWalletPaymentNeverAsksTheRail(t *testing.T) {
	up, rails, router := railDown(t)
	rec := post(t, router, "/v1/sandbox/test-payers/tp-1/payments", `{"payment_session_id":"own"}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("a wallet payment with the rail down: %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"rail":"WALLET"`) || !strings.Contains(rec.Body.String(), `"status":"PAID"`) {
		t.Fatalf("the wallet payment should report rail WALLET and PAID: %s", rec.Body)
	}
	if rails.reads != 0 {
		t.Fatalf("a wallet payment read the external rail %d time(s); it must not depend on it", rails.reads)
	}
	if len(up.calls) != 1 {
		t.Fatalf("the payment should have reached the payer's wallet path once: %v", up.calls)
	}
}

func TestSandboxRail_ARailDependentPaymentFailsClosed(t *testing.T) {
	for _, simulate := range []string{"DECLINED", "PROVIDER_UNAVAILABLE", "TIMEOUT", "DELAYED"} {
		t.Run(simulate, func(t *testing.T) {
			up, _, router := railDown(t)
			rec := post(t, router, "/v1/sandbox/test-payers/tp-1/payments", `{"payment_session_id":"own","simulate":"`+simulate+`"}`, "k-"+simulate)
			if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), `"PROVIDER_UNAVAILABLE"`) || !strings.Contains(rec.Body.String(), `"rail":"EXTERNAL_SIMULATED"`) {
				t.Fatalf("simulate %s with the rail down: %d %s", simulate, rec.Code, rec.Body)
			}
			if len(up.calls) != 0 {
				t.Fatalf("nothing may move when the rail is down: %v", up.calls)
			}
		})
	}
}

func TestSandboxRail_TheRailBelongsToTheKeysOwnBusiness(t *testing.T) {
	up := newUpstream(t)
	h := NewSandboxDevHandler(up.srv.URL, "ik", sbxSessions{}, sbxLinks{}).WithExternalRails(&fakeRails{})
	unbound := &middleware.DeveloperPrincipal{ProjectID: "proj-X", Environment: "SANDBOX", Scopes: []string{"sandbox:read", "sandbox:write"}}
	if rec := put(t, railRouter(h, unbound), "/v1/sandbox/external-rail", `{"state":"UNAVAILABLE"}`); rec.Code != http.StatusForbidden {
		t.Fatalf("a project with no Business has no rail: %d %s", rec.Code, rec.Body)
	}
	readOnly := principalA()
	readOnly.Scopes = []string{"sandbox:read"}
	if rec := put(t, railRouter(h, readOnly), "/v1/sandbox/external-rail", `{"state":"UNAVAILABLE"}`); rec.Code != http.StatusForbidden {
		t.Fatalf("setting the rail needs sandbox:write: %d %s", rec.Code, rec.Body)
	}
	if rec := put(t, railRouter(h, principalA()), "/v1/sandbox/external-rail", `{"state":"DOWN"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an unknown state: %d %s", rec.Code, rec.Body)
	}
}

func TestCoreProviderUnavailableIsNotCollapsedInto502(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/public/pay/s/pay", nil)
	respondCoreError(rec, req, &service.CoreError{Status: http.StatusServiceUnavailable, Code: "PROVIDER_UNAVAILABLE", Message: "rail down"}, "could not start the payment")
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "PROVIDER_UNAVAILABLE") {
		t.Fatalf("a rail outage is the caller's outcome, not a Banzami 502: %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	respondCoreError(rec, req, &service.CoreError{Status: http.StatusServiceUnavailable, Code: "DATABASE_DOWN"}, "x")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("any other Core 5xx stays 502: %d", rec.Code)
	}
}
