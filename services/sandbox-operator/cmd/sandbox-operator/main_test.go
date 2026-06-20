package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// getJSON issues a GET against the mux and decodes the JSON body.
func getJSON(t *testing.T, path string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	newMux().ServeHTTP(rec, req)

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response for %s is not valid JSON: %v", path, err)
	}
	return rec.Code, body
}

// TestHealthL0 covers HEALTH-001 and HEALTH-002.
func TestHealthL0(t *testing.T) {
	code, body := getJSON(t, "/health")
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if body["status"] != "ok" {
		t.Errorf("status = %v, want ok", body["status"])
	}
	if body["environment"] != "sandbox" {
		t.Errorf("environment = %v, want sandbox", body["environment"])
	}
	if body["simulated"] != true {
		t.Errorf("simulated = %v, want true", body["simulated"])
	}
	if body["production_allowed"] != false {
		t.Errorf("production_allowed = %v, want false", body["production_allowed"])
	}
}

// TestManifestL0 covers MAN-001, MAN-002 and MAN-003.
func TestManifestL0(t *testing.T) {
	code, body := getJSON(t, "/.well-known/banza/operator.json")
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	for _, f := range []string{"operator_id", "environment", "simulated", "production_allowed", "capabilities"} {
		if _, ok := body[f]; !ok {
			t.Errorf("manifest missing required field %q", f)
		}
	}
	if body["environment"] != "sandbox" {
		t.Errorf("environment = %v, want sandbox", body["environment"])
	}
	if body["simulated"] != true {
		t.Errorf("simulated = %v, want true", body["simulated"])
	}
	if body["production_allowed"] != false {
		t.Errorf("production_allowed = %v, want false", body["production_allowed"])
	}
	caps, ok := body["capabilities"].(map[string]any)
	if !ok {
		t.Fatalf("capabilities is not an object: %T", body["capabilities"])
	}
	for _, c := range []string{"supports_wallets", "supports_qr", "supports_settlement"} {
		if _, ok := caps[c]; !ok {
			t.Errorf("capabilities missing required key %q", c)
		}
	}
}

// TestSandboxSafetyInvariant asserts the binary cannot represent production.
func TestSandboxSafetyInvariant(t *testing.T) {
	_, h := getJSON(t, "/health")
	_, m := getJSON(t, "/.well-known/banza/operator.json")
	if h["production_allowed"] != false || m["production_allowed"] != false {
		t.Fatal("production_allowed must be false everywhere")
	}
	if h["simulated"] != true || m["simulated"] != true {
		t.Fatal("simulated must be true everywhere")
	}
}
