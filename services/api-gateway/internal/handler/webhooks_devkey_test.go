package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Webhook management under a developer credential.
//
// Before this, webhooks were merchant-JWT only: a Developer Platform
// application could not see or manage the endpoint carrying its own events
// without holding a merchant credential — precisely the authority the platform
// exists to withhold. These pin that the merchant now comes from the project
// binding, that each route demands its own scope, and that another tenant's
// endpoint is indistinguishable from one that does not exist.

type devWebhooks struct {
	rotated    string
	rotatedFor string
	endpoints  map[string]*service.WebhookEndpoint // key: merchantID
}

func (f *devWebhooks) RegisterEndpoint(_ context.Context, req service.RegisterEndpointRequest) (*service.WebhookEndpoint, error) {
	return &service.WebhookEndpoint{ID: "ep-new", MerchantID: req.MerchantID, URL: req.URL, Events: req.Events, Secret: "whsec_x"}, nil
}
func (f *devWebhooks) GetEndpoint(_ context.Context, merchantID, id string) (*service.WebhookEndpoint, error) {
	if ep, ok := f.endpoints[merchantID]; ok && ep.ID == id {
		return ep, nil
	}
	return nil, service.ErrEndpointNotFound
}
func (f *devWebhooks) ListEndpoints(_ context.Context, merchantID string) ([]*service.WebhookEndpoint, error) {
	if ep, ok := f.endpoints[merchantID]; ok {
		return []*service.WebhookEndpoint{ep}, nil
	}
	return nil, nil
}
func (f *devWebhooks) DeactivateEndpoint(context.Context, string, string) error { return nil }
func (f *devWebhooks) Dispatch(context.Context, service.DispatchRequest) (*service.WebhookEvent, error) {
	return nil, nil
}
func (f *devWebhooks) ListEvents(context.Context, string, int) ([]*service.WebhookEvent, error) {
	return nil, nil
}
func (f *devWebhooks) ListDeliveries(context.Context, string, string) ([]*service.WebhookDelivery, error) {
	return nil, nil
}
func (f *devWebhooks) ReplayDelivery(context.Context, string, string) (*service.WebhookDelivery, error) {
	return nil, nil
}
func (f *devWebhooks) EndpointHealth(context.Context, string, string) (*service.EndpointHealth, error) {
	return nil, nil
}
func (f *devWebhooks) RotateEndpointSecret(_ context.Context, merchantID, id string) (*service.WebhookEndpoint, error) {
	ep, ok := f.endpoints[merchantID]
	if !ok || ep.ID != id {
		return nil, service.ErrEndpointNotFound
	}
	f.rotated, f.rotatedFor = id, merchantID
	return &service.WebhookEndpoint{ID: ep.ID, MerchantID: merchantID, URL: ep.URL, Secret: "whsec_rotated"}, nil
}

func devWbhReq(method, target, body string, scopes ...string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), boundDevPrincipal(scopes...)))
}

func withURLParam(r *http.Request, key, val string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, val)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestDevKeyWebhook_RegisteredUnderTheBoundMerchant(t *testing.T) {
	h := NewWebhookHandler(&devWebhooks{})
	rec := httptest.NewRecorder()
	h.Register(rec, devWbhReq("POST", "https://x/v1/webhooks/endpoints",
		`{"url":"https://www.doadoa.app/api/webhooks/banzami","events":["payment_link.paid"]}`,
		"webhooks:write"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got service.WebhookEndpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	// The merchant came from the binding. There is no request field that could
	// have supplied it, which is the point — nothing to reject because nothing
	// to offer.
	if got.MerchantID != "bound-merchant" {
		t.Fatalf("endpoint registered under %q, want the binding's merchant", got.MerchantID)
	}
}

func TestDevKeyWebhook_ScopeIsRequiredPerOperation(t *testing.T) {
	h := NewWebhookHandler(&devWebhooks{})

	// A read scope must never authorize a mutation.
	rec := httptest.NewRecorder()
	h.Register(rec, devWbhReq("POST", "https://x/v1/webhooks/endpoints",
		`{"url":"https://www.doadoa.app/api/webhooks/banzami","events":["payment_link.paid"]}`,
		"webhooks:read"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("register with only webhooks:read: want 403, got %d", rec.Code)
	}

	// Nor may a payment scope stand in for a webhook one.
	rec = httptest.NewRecorder()
	h.ListEndpoints(rec, devWbhReq("GET", "https://x/v1/webhooks/endpoints", "",
		"payment_sessions:write"))
	if rec.Code != http.StatusForbidden {
		t.Errorf("list with an unrelated scope: want 403, got %d", rec.Code)
	}
}

func TestDevKeyWebhook_RotateSecretIsScopedToTheOwner(t *testing.T) {
	f := &devWebhooks{endpoints: map[string]*service.WebhookEndpoint{
		"bound-merchant": {ID: "ep-1", MerchantID: "bound-merchant", URL: "https://www.doadoa.app/api/webhooks/banzami"},
		"someone-else":   {ID: "ep-foreign", MerchantID: "someone-else", URL: "https://elsewhere.example/hook"},
	}}
	h := NewWebhookHandler(f)

	// Own endpoint: rotates, and the new secret is returned once.
	rec := httptest.NewRecorder()
	h.RotateSecret(rec, withURLParam(devWbhReq("POST", "https://x/rotate", "", "webhooks:write"), "id", "ep-1"))
	if rec.Code != http.StatusOK {
		t.Fatalf("rotate own endpoint: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "whsec_rotated") {
		t.Error("the new secret must be returned exactly once, at rotation")
	}
	if f.rotatedFor != "bound-merchant" {
		t.Errorf("rotated for %q, want the binding's merchant", f.rotatedFor)
	}

	// Another tenant's endpoint: 404, never 403. A status code that distinguishes
	// "yours" from "someone else's" is an enumeration oracle for endpoint ids.
	f.rotated, f.rotatedFor = "", ""
	rec = httptest.NewRecorder()
	h.RotateSecret(rec, withURLParam(devWbhReq("POST", "https://x/rotate", "", "webhooks:write"), "id", "ep-foreign"))
	if rec.Code != http.StatusNotFound {
		t.Errorf("foreign endpoint: want 404, got %d", rec.Code)
	}
	if f.rotated != "" {
		t.Error("a foreign endpoint's secret was rotated — the victim must be untouched")
	}
}

func TestDevKeyWebhook_UnboundProjectHasNoWebhooks(t *testing.T) {
	h := NewWebhookHandler(&devWebhooks{})
	dp := boundDevPrincipal("webhooks:read")
	dp.Bound, dp.MerchantID = false, ""
	req := httptest.NewRequest("GET", "https://x/v1/webhooks/endpoints", nil)
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), dp))

	rec := httptest.NewRecorder()
	h.ListEndpoints(rec, req)
	// Refused, not an empty list: an empty list would imply the question was
	// meaningful and the answer was "none", which is a different claim.
	if rec.Code != http.StatusForbidden {
		t.Fatalf("unbound project: want 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}
