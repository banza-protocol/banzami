package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// An operator wallet credit is one credit per Idempotency-Key. Without a key a
// double submit, a retry or a replay each created the money again; the key is
// now required and travels to core, which makes it the posting's unique ledger
// key (core credit_idempotency).
func creditRoute(t *testing.T) (http.Handler, *[]map[string]any) {
	t.Helper()
	var seen []map[string]any
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		seen = append(seen, body)
		if body["idempotency_key"] == "reused-key-0001" && body["amount_minor"].(float64) != 1000 {
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{"error":{"code":"IDEMPOTENCY_KEY_REUSED","message":"different credit"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"wallet_id":"w","amount_minor":1000,"currency":"AOA","new_balance":1000}`))
	}))
	t.Cleanup(core.Close)
	r := chi.NewRouter()
	r.Post("/admin/v1/wallets/{id}/credit", NewWalletHandler(service.NewCoreAdminClient(core.URL)).AdminCredit)
	return r, &seen
}

func postCredit(h http.Handler, key string, amount int) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/admin/v1/wallets/w1/credit",
		strings.NewReader(`{"amount_minor":`+creditAmount(amount)+`,"currency":"AOA","reason":"pilot funding"}`))
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func creditAmount(n int) string { b, _ := json.Marshal(n); return string(b) }

func TestAdminCredit_RequiresAnIdempotencyKey(t *testing.T) {
	h, seen := creditRoute(t)
	if w := postCredit(h, "", 1000); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "IDEMPOTENCY_KEY_REQUIRED") {
		t.Fatalf("without a key: got %d %s", w.Code, w.Body.String())
	}
	if len(*seen) != 0 {
		t.Fatal("a credit without a key must not reach core")
	}
}

func TestAdminCredit_CarriesTheKeyAndSurfacesReuse(t *testing.T) {
	h, seen := creditRoute(t)
	if w := postCredit(h, "reused-key-0001", 1000); w.Code != http.StatusOK {
		t.Fatalf("first credit: %d %s", w.Code, w.Body.String())
	}
	if got := (*seen)[0]["idempotency_key"]; got != "reused-key-0001" {
		t.Fatalf("core received idempotency_key %v", got)
	}
	if w := postCredit(h, "reused-key-0001", 5000); w.Code != http.StatusConflict {
		t.Fatalf("same key, other amount: got %d %s, want 409", w.Code, w.Body.String())
	}
}
