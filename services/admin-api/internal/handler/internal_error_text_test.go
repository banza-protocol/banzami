package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// A6-11 — internal error text is never written into a response body.
//
// These operator handlers answered a failure with err.Error(): the transport
// error names core's internal address ("core-api …: dial tcp 127.0.0.1:…"), and
// the 5xx path forwarded core's own message, which can be its database error.
// Each is driven here through a REAL CoreAdminClient pointed at an address
// nothing listens on, and at a core that answers 500 with database text.

const coreDBErrorText = `duplicate key value violates unique constraint "consumers_pkey"`

func assertNoInternalText(t *testing.T, w *httptest.ResponseRecorder, wantStatus int) {
	t.Helper()
	body := w.Body.String()
	for _, leak := range []string{"dial tcp", "127.0.0.1", "connection refused", "core-api", "duplicate key", "consumers_pkey"} {
		if strings.Contains(body, leak) {
			t.Fatalf("response body carries internal error text %q: %s", leak, body)
		}
	}
	if w.Code != wantStatus {
		t.Fatalf("status = %d, want %d (body %s)", w.Code, wantStatus, body)
	}
}

type coreCall struct {
	method, pattern, path, body string
	header                      map[string]string
	h                           func(core *service.CoreAdminClient) http.HandlerFunc
}

func coreCalls() map[string]coreCall {
	return map[string]coreCall{
		"consumers.list": {http.MethodGet, "/admin/v1/consumers", "/admin/v1/consumers", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewConsumerHandler(c).List }},
		"consumers.get": {http.MethodGet, "/admin/v1/consumers/{id}", "/admin/v1/consumers/c-1", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewConsumerHandler(c).Get }},
		"consumers.suspend": {http.MethodPost, "/admin/v1/consumers/{id}/suspend", "/admin/v1/consumers/c-1/suspend", `{"notes":"n"}`, nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewConsumerHandler(c).Suspend }},
		"consumers.badge": {http.MethodPatch, "/admin/v1/consumers/{id}/badge", "/admin/v1/consumers/c-1/badge", `{"badge":"VERIFIED"}`, nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewConsumerHandler(c).SetBadge }},
		"wallets.for_merchant": {http.MethodGet, "/admin/v1/wallets", "/admin/v1/wallets?merchant_id=m-1&currency=AOA", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewWalletHandler(c).GetForMerchant }},
		"wallets.accounts": {http.MethodGet, "/admin/v1/wallets/{id}/accounts", "/admin/v1/wallets/w-1/accounts", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewWalletHandler(c).ListAccounts }},
		"wallets.credit": {http.MethodPost, "/admin/v1/wallets/{id}/credit", "/admin/v1/wallets/w-1/credit", `{"amount_minor":100,"reason":"r"}`,
			map[string]string{"Idempotency-Key": "credit-key-0001"},
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewWalletHandler(c).AdminCredit }},
		"disputes.list": {http.MethodGet, "/admin/v1/disputes", "/admin/v1/disputes", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewDisputeHandler(c, nil, "SANDBOX").List }},
		"disputes.get": {http.MethodGet, "/admin/v1/disputes/{id}", "/admin/v1/disputes/d-1", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewDisputeHandler(c, nil, "SANDBOX").Get }},
		"pricing_rules.get (handleCoreErr)": {http.MethodGet, "/admin/v1/finance/pricing-rules/{id}", "/admin/v1/finance/pricing-rules/pr-1", "", nil,
			func(c *service.CoreAdminClient) http.HandlerFunc { return NewPricingRuleHandler(c).Get }},
	}
}

func serve(c coreCall, core *service.CoreAdminClient) *httptest.ResponseRecorder {
	req := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
	for k, v := range c.header {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, c.method, c.pattern, c.h(core)).ServeHTTP(w, req)
	return w
}

func TestAdminCoreCalls_TransportErrorTextNeverInBody(t *testing.T) {
	for name, c := range coreCalls() {
		t.Run(name, func(t *testing.T) {
			w := serve(c, service.NewCoreAdminClient("http://127.0.0.1:1")) // nothing listening
			assertNoInternalText(t, w, http.StatusInternalServerError)
			if !strings.Contains(w.Body.String(), `"INTERNAL_ERROR"`) {
				t.Fatalf("no stable code: %s", w.Body.String())
			}
		})
	}
}

func TestAdminCoreCalls_Core5xxDatabaseTextNeverInBody(t *testing.T) {
	for name, c := range coreCalls() {
		t.Run(name, func(t *testing.T) {
			fc := newFakeCore()
			defer fc.close()
			fc.respond = func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = fmt.Fprintf(w, `{"error":{"code":"INTERNAL","message":%q}}`, coreDBErrorText)
			}
			w := serve(c, service.NewCoreAdminClient(fc.srv.URL))
			assertNoInternalText(t, w, http.StatusInternalServerError)
		})
	}
}

// A core refusal (4xx) is a decision: it keeps its status and core's reason,
// where Suspend used to answer 422 and SetBadge 400 whatever core said.
func TestAdminCoreCalls_CoreRefusalKeepsItsStatusAndReason(t *testing.T) {
	c := coreCalls()["consumers.suspend"]
	fc := newFakeCore()
	defer fc.close()
	fc.respond = func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":{"code":"ALREADY_SUSPENDED","message":"consumer is already suspended"}}`))
	}
	w := serve(c, service.NewCoreAdminClient(fc.srv.URL))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "ALREADY_SUSPENDED") || !strings.Contains(w.Body.String(), "consumer is already suspended") {
		t.Fatalf("core refusal not forwarded: %d %s", w.Code, w.Body.String())
	}
}

// beginFails is an MFA service whose enrolment fails with the given error.
type beginFails struct {
	*fakeMFA
	err error
}

func (b beginFails) BeginEnrolment(context.Context, string, string) (string, string, error) {
	return "", "", b.err
}

func TestMFAEnrol_DatabaseErrorTextNeverInBody(t *testing.T) {
	_, f, u := mfaFixture(t, false)
	dbErr := errors.New("failed to connect to `host=127.0.0.1 user=banzami`: dial tcp 127.0.0.1:5432: connect: connection refused")
	h := NewMFAHandler(beginFails{fakeMFA: f, err: dbErr}, &fakeLogins{user: u}, testSecret, 0)
	w := post(h.Enrol, tokenFor(t, u, auth.PurposeMFAEnroll), "")
	assertNoInternalText(t, w, http.StatusInternalServerError)
}

func TestMFAEnrol_ConfirmedFactorIsStillARefusal(t *testing.T) {
	_, f, u := mfaFixture(t, false)
	h := NewMFAHandler(beginFails{fakeMFA: f, err: service.ErrMFAAlreadyConfirmed}, &fakeLogins{user: u}, testSecret, 0)
	w := post(h.Enrol, tokenFor(t, u, auth.PurposeMFAEnroll), "")
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "ENROLMENT_REFUSED") {
		t.Fatalf("a confirmed factor must still refuse enrolment: %d %s", w.Code, w.Body.String())
	}
}
