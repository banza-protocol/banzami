package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
)

// A Business cannot verify itself. The route ran the configured KYB provider
// for the caller and wrote its answer as the KYB decision — and the Sandbox's
// simulated provider approves any name with a six-character NIF. The service
// behind it must not be reached at all.
func TestVerifyMerchant_ABusinessCannotDecideItsOwnKYB(t *testing.T) {
	h := NewComplianceHandler(nil) // a nil service: any call into it would panic
	req := httptest.NewRequest(http.MethodPost, "/v1/compliance/merchants/verify",
		strings.NewReader(`{"legal_name":"Loja","tax_id":"5001234567","representative_name":"João"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: "m-1", Environment: "SANDBOX"}))
	rec := httptest.NewRecorder()
	h.VerifyMerchant(rec, req)
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "KYB_DECIDED_BY_REVIEW") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}
