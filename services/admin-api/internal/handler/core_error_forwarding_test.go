package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// End-to-end: a >=400 from core-api is forwarded with the SAME status code and
// the SAME {error:{code,message}} payload — never masked as 500. Exercised
// through a real handler (PricingRuleHandler.Get -> CoreAdminClient.do ->
// handleCoreErr), so it covers the whole admin-api error path that all 13
// core-using handlers share.
func TestCoreErr_ForwardsStatusAndPayload(t *testing.T) {
	cases := []struct {
		status int
		code   string
	}{
		{http.StatusBadRequest, "BAD_REQUEST"},
		{http.StatusUnauthorized, "UNAUTHORIZED"},
		{http.StatusForbidden, "FORBIDDEN"},
		{http.StatusNotFound, "NOT_FOUND"},
		{http.StatusConflict, "INVALID_STATUS"},
		{http.StatusUnprocessableEntity, "FEE_EXCEEDS_GROSS"},
		{http.StatusTooManyRequests, "RATE_LIMITED"},
		{http.StatusInternalServerError, "UPSTREAM_BOOM"},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%d", c.status), func(t *testing.T) {
			fc := newFakeCore()
			defer fc.close()
			sc := c
			fc.respond = func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(sc.status)
				_, _ = fmt.Fprintf(w, `{"error":{"code":%q,"message":"upstream message"}}`, sc.code)
			}
			h := NewPricingRuleHandler(service.NewCoreAdminClient(fc.srv.URL))

			w := httptest.NewRecorder()
			auditedRoute(&annSink{}, http.MethodGet, "/admin/v1/finance/pricing-rules/{id}", h.Get).
				ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin/v1/finance/pricing-rules/pr-1", nil))

			if w.Code != sc.status {
				t.Fatalf("status not preserved: got %d want %d", w.Code, sc.status)
			}
			var body struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("bad body: %v", err)
			}
			// A decision (4xx) keeps core's reason. A failure (5xx) keeps its
			// status and code, never its text: a core 5xx message can be core's
			// own database error (A6-11).
			wantMsg := "upstream message"
			if sc.status >= 500 {
				wantMsg = internalErrorMessage
			}
			if body.Error.Code != sc.code || body.Error.Message != wantMsg {
				t.Fatalf("payload not preserved: %+v", body.Error)
			}
		})
	}
}

// A genuine transport failure (core unreachable) is a real internal error → 500.
func TestCoreErr_TransportFailureIs500(t *testing.T) {
	h := NewPricingRuleHandler(service.NewCoreAdminClient("http://127.0.0.1:1")) // nothing listening
	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodGet, "/admin/v1/finance/pricing-rules/{id}", h.Get).
		ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin/v1/finance/pricing-rules/pr-1", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("transport failure should be 500, got %d", w.Code)
	}
}
