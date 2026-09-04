package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Regression cover for the four defects the deployed CAP-WEBHOOK-001 suite
// found (RA-060 … RA-063). Each test states the defect, not just the assertion,
// because "returns 404" on its own does not say what went wrong.

const (
	merchantA = "11111111-1111-1111-1111-111111111111"
	merchantB = "22222222-2222-2222-2222-222222222222"
)

func asMerchant(req *http.Request, merchantID string) *http.Request {
	return req.WithContext(middleware.ContextWithPrincipal(
		req.Context(), &middleware.Principal{MerchantID: merchantID, Environment: "SANDBOX"}))
}

func withURLParam(req *http.Request, key, val string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, val)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// seedEventFor registers an endpoint for the merchant and dispatches one event,
// returning the event id — the same path the production flow takes.
func seedEventFor(t *testing.T, svc *service.StubWebhookService, merchantID string) string {
	t.Helper()
	if _, err := svc.RegisterEndpoint(context.Background(), service.RegisterEndpointRequest{
		MerchantID: merchantID,
		URL:        "https://example.com/hook",
		Events:     []string{"payment_link.paid"},
	}); err != nil {
		t.Fatalf("register endpoint: %v", err)
	}
	ev, err := svc.Dispatch(context.Background(), service.DispatchRequest{
		MerchantID: merchantID,
		EventType:  "payment_link.paid",
		Payload:    json.RawMessage(`{"id":"link_1"}`),
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	return ev.ID
}

// RA-060 — ListDeliveries took an event id and no merchant, so the Postgres
// query was `WHERE event_id = $1`. Any authenticated merchant could read any
// event's delivery history by id, including the receiver's response body and
// the endpoint it was sent to. Naming an event id is not authority over it.
func TestListDeliveries_ForeignEventIsNotFound(t *testing.T) {
	svc := service.NewStubWebhookService()
	h := handler.NewWebhookHandler(svc)
	eventID := seedEventFor(t, svc, merchantA)

	req := asMerchant(httptest.NewRequest("GET", "/v1/webhooks/events/"+eventID+"/deliveries", nil), merchantB)
	rec := httptest.NewRecorder()
	h.ListDeliveries(rec, withURLParam(req, "id", eventID))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("foreign event must be not-found, got HTTP %d: %s", rec.Code, rec.Body.String())
	}
	// A refusal that still names the resource is a disclosure of its own.
	for _, leak := range []string{eventID, merchantA, "endpoint_id", "response_body"} {
		if strings.Contains(rec.Body.String(), leak) {
			t.Errorf("refusal leaked %q: %s", leak, rec.Body.String())
		}
	}
}

// The owner must still be served — a fix that breaks the legitimate path is not
// a fix.
func TestListDeliveries_OwnerIsServed(t *testing.T) {
	svc := service.NewStubWebhookService()
	h := handler.NewWebhookHandler(svc)
	eventID := seedEventFor(t, svc, merchantA)

	req := asMerchant(httptest.NewRequest("GET", "/v1/webhooks/events/"+eventID+"/deliveries", nil), merchantA)
	rec := httptest.NewRecorder()
	h.ListDeliveries(rec, withURLParam(req, "id", eventID))

	// RA-061 — status_code and response_body are NULL until an attempt
	// completes, and the scan targeted int/string, so this returned 500 to its
	// own owner on every pending delivery. The 500 was also hiding RA-060.
	if rec.Code != http.StatusOK {
		t.Fatalf("owner must be able to read pending deliveries, got HTTP %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("owner response is not JSON: %v", err)
	}
}

// RA-062 — registration accepted any string as an event name, so an endpoint
// could subscribe to a typo and never fire, with nothing to distinguish that
// from a quiet integration.
func TestRegisterEndpoint_RejectsUnknownEvent(t *testing.T) {
	h := handler.NewWebhookHandler(service.NewStubWebhookService())

	body := `{"url":"https://example.com/hook","events":["not.a.real.event"]}`
	req := asMerchant(httptest.NewRequest("POST", "/v1/webhooks/endpoints", strings.NewReader(body)), merchantA)
	rec := httptest.NewRecorder()
	h.Register(rec, req)

	if rec.Code < 400 || rec.Code >= 500 {
		t.Fatalf("unknown event must be a safe 4xx, got HTTP %d: %s", rec.Code, rec.Body.String())
	}
	assertNoInternalDetail(t, rec.Body.String())
}

// RA-063 — an unbounded caller-controlled destination string was accepted.
func TestRegisterEndpoint_RejectsOversizedURL(t *testing.T) {
	h := handler.NewWebhookHandler(service.NewStubWebhookService())

	long := "https://example.com/" + strings.Repeat("a", service.MaxWebhookURLLength+1)
	body := `{"url":"` + long + `","events":["payment_link.paid"]}`
	req := asMerchant(httptest.NewRequest("POST", "/v1/webhooks/endpoints", strings.NewReader(body)), merchantA)
	rec := httptest.NewRecorder()
	h.Register(rec, req)

	if rec.Code < 400 || rec.Code >= 500 {
		t.Fatalf("oversized url must be a safe 4xx, got HTTP %d", rec.Code)
	}
	assertNoInternalDetail(t, rec.Body.String())
}

// Valid registration must still be accepted — the negatives above are worthless
// if the fix simply refuses everything.
func TestRegisterEndpoint_ValidStillAccepted(t *testing.T) {
	h := handler.NewWebhookHandler(service.NewStubWebhookService())

	for _, ev := range []string{"payment.completed", "payment_link.paid", "payout.sent"} {
		body := `{"url":"https://example.com/hook","events":["` + ev + `"]}`
		req := asMerchant(httptest.NewRequest("POST", "/v1/webhooks/endpoints", strings.NewReader(body)), merchantA)
		rec := httptest.NewRecorder()
		h.Register(rec, req)
		if rec.Code != http.StatusCreated {
			t.Errorf("%s must remain registrable, got HTTP %d: %s", ev, rec.Code, rec.Body.String())
		}
	}

	// A URL at the limit is allowed; only past it is refused.
	atLimit := "https://example.com/" + strings.Repeat("a", service.MaxWebhookURLLength-len("https://example.com/"))
	body := `{"url":"` + atLimit + `","events":["payment_link.paid"]}`
	req := asMerchant(httptest.NewRequest("POST", "/v1/webhooks/endpoints", strings.NewReader(body)), merchantA)
	rec := httptest.NewRecorder()
	h.Register(rec, req)
	if rec.Code != http.StatusCreated {
		t.Errorf("url at the limit must be accepted, got HTTP %d", rec.Code)
	}
}

// Error bodies must stay caller-safe: no driver text, no SQL, no stack.
func assertNoInternalDetail(t *testing.T, body string) {
	t.Helper()
	for _, marker := range []string{"pq:", "pgx", "SQLSTATE", "goroutine", "panic", "sql:"} {
		if strings.Contains(body, marker) {
			t.Errorf("error body leaked internal detail %q: %s", marker, body)
		}
	}
}
