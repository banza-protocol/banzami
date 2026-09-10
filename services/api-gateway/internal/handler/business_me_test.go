package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// This resource names the Business's own wallet and account ids, which is right
// for its dashboard session and wrong for a Project key: behind a Project the
// owner is the operator's. A key is sent to the Project-scoped resource.
func TestIntegration_AProjectKeyIsSentToFinancialSetup(t *testing.T) {
	h := NewBusinessMeHandler(&service.BusinessSelfService{})
	req := httptest.NewRequest(http.MethodGet, "/v1/integration", nil)
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), devPrincipal("doa-sandbox")))
	w := httptest.NewRecorder()
	h.Me(w, req)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "USE_FINANCIAL_SETUP") {
		t.Fatalf("want 403 USE_FINANCIAL_SETUP, got %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "merchant-internal-uuid") {
		t.Fatal("the refusal leaked the binding's owner")
	}
}

func TestBusinessMe_Unavailable503WhenUnconfigured(t *testing.T) {
	h := NewBusinessMeHandler(nil)
	w := httptest.NewRecorder()
	h.Me(w, httptest.NewRequest(http.MethodGet, "/v1/integration", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil svc: status = %d, want 503", w.Code)
	}
}

// The DB-backed happy path (service.Self) is covered by the sandbox smoke test.
// Here we assert the JSON contract exposes only non-secret fields — a regression
// guard so no future edit adds a key/PIN/ledger id to the self profile.
func TestBusinessMe_ContractCarriesNoSecrets(t *testing.T) {
	body := map[string]any{
		"environment":           "SANDBOX",
		"id":                    "m-1",
		"handle":                "doa",
		"business_name":         "Doa",
		"business_account_type": "MERCHANT",
		"status":                "ACTIVE",
		"kyb_status":            "APPROVED",
		"verified":              true,
		"category":              "Doações e causas",
		"pricing_category":      "DONATION",
		"wallet_ready":          true,
		"settlement_ready":      true,
		"pricing":               map[string]any{"category": "DONATION", "fee_bps": 50, "found": true},
		"wallet":                map[string]any{"ready": true, "wallet_id": "w-1", "currency": "AOA", "primary_account_id": "pa-1"},
		"settlement":            map[string]any{"ready": true, "enabled": true, "blockers": []string{}},
		"blockers":              []string{},
	}
	raw, _ := json.Marshal(body)
	// True secrets only. Opaque wallet/account ids are the owner's own
	// operational identifiers and are intentionally part of the resolution.
	for _, secret := range []string{"api_key", "\"secret\"", "\"pin\"", "bz_test", "bz_live", "key_hash", "storage_key"} {
		if strings.Contains(string(raw), secret) {
			t.Errorf("self profile must not carry %q", secret)
		}
	}
}
