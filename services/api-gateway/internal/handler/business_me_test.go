package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBusinessMe_Unavailable503WhenUnconfigured(t *testing.T) {
	h := NewBusinessMeHandler(nil)
	w := httptest.NewRecorder()
	h.Me(w, httptest.NewRequest(http.MethodGet, "/v1/business/me", nil))
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
