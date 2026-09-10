package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// An operator-issued API key names its environment. An omitted field used to
// become LIVE and mint a real-money key; it is now refused before core is
// asked for anything (core is nil here and never reached).
func TestCreateApiKey_RefusesAnUnnamedEnvironment(t *testing.T) {
	h := NewMerchantSetupHandler(nil, nil)
	r := chi.NewRouter()
	r.Post("/admin/v1/merchants/{id}/api-keys", h.CreateApiKey)
	for _, body := range []string{`{"name":"k"}`, `{"name":"k","environment":""}`, `{"name":"k","environment":"PRODUCTION"}`} {
		req := httptest.NewRequest(http.MethodPost, "/admin/v1/merchants/00000000-0000-4000-8000-000000000001/api-keys", strings.NewReader(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "ENVIRONMENT_REQUIRED") {
			t.Fatalf("%s: status %d body %s; want 400 ENVIRONMENT_REQUIRED", body, rec.Code, rec.Body.String())
		}
	}
}
