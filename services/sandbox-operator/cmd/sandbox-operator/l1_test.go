package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// l1Mux builds a mux with the L1 surface mounted on a fresh in-memory store,
// independent of the SANDBOX_L1_ENABLED env var.
func l1Mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /.well-known/banza/operator.json", handleManifest)
	registerL1(mux, newL1Store())
	return mux
}

func do(t *testing.T, mux *http.ServeMux, method, path string, body any) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// TestL1WalletLifecycle covers WLT-001/002/004/005.
func TestL1WalletLifecycle(t *testing.T) {
	mux := l1Mux()

	code, w := do(t, mux, "POST", "/wallets", map[string]any{"label": "alice", "currency": "AOA"})
	if code != http.StatusCreated {
		t.Fatalf("POST /wallets = %d, want 201", code)
	}
	for _, f := range []string{"id", "label", "currency", "balance_minor"} {
		if _, ok := w[f]; !ok {
			t.Errorf("wallet response missing %q", f)
		}
	}
	if w["balance_minor"].(float64) != 0 {
		t.Errorf("new wallet balance_minor = %v, want 0", w["balance_minor"])
	}
	id := w["id"].(string)

	code, g := do(t, mux, "GET", "/wallets/"+id, nil)
	if code != http.StatusOK {
		t.Fatalf("GET /wallets/:id = %d, want 200", code)
	}
	if _, ok := g["balance_minor"]; !ok {
		t.Error("GET wallet missing inline balance_minor")
	}

	code, _ = do(t, mux, "GET", "/wallets/wallet-does-not-exist", nil)
	if code != http.StatusNotFound {
		t.Errorf("GET unknown wallet = %d, want 404", code)
	}
}

// TestL1SeedFunds covers POST /wallets/:id/seed.
func TestL1SeedFunds(t *testing.T) {
	mux := l1Mux()
	_, w := do(t, mux, "POST", "/wallets", map[string]any{"label": "w", "currency": "AOA"})
	id := w["id"].(string)

	code, s := do(t, mux, "POST", "/wallets/"+id+"/seed", map[string]any{"amount_minor": 1_000_000, "currency": "AOA"})
	if code != http.StatusOK {
		t.Fatalf("seed = %d, want 200", code)
	}
	if s["balance_minor"].(float64) != 1_000_000 {
		t.Errorf("balance after seed = %v, want 1000000", s["balance_minor"])
	}
	_, g := do(t, mux, "GET", "/wallets/"+id, nil)
	if g["balance_minor"].(float64) != 1_000_000 {
		t.Errorf("GET wallet balance = %v, want 1000000", g["balance_minor"])
	}
}

// TestL1TransferSuccess covers TRF-001/008 (txfr- id, tr- trace_id, GET transfer).
func TestL1TransferSuccess(t *testing.T) {
	mux := l1Mux()
	_, a := do(t, mux, "POST", "/wallets", map[string]any{"label": "a", "currency": "AOA"})
	_, b := do(t, mux, "POST", "/wallets", map[string]any{"label": "b", "currency": "AOA"})
	aid, bid := a["id"].(string), b["id"].(string)
	do(t, mux, "POST", "/wallets/"+aid+"/seed", map[string]any{"amount_minor": 1_000_000})

	code, tr := do(t, mux, "POST", "/transfers", map[string]any{
		"from_wallet_id": aid, "to_wallet_id": bid, "amount_minor": 50_000,
		"currency": "AOA", "idempotency_key": "idem-success-1",
	})
	if code != http.StatusCreated {
		t.Fatalf("POST /transfers = %d, want 201", code)
	}
	for _, f := range []string{"id", "from_wallet_id", "to_wallet_id", "amount_minor", "currency", "trace_id"} {
		if _, ok := tr[f]; !ok {
			t.Errorf("transfer response missing %q", f)
		}
	}
	if id := tr["id"].(string); !strings.HasPrefix(id, "txfr-") {
		t.Errorf("transfer id = %q, want txfr- prefix", id)
	}
	traceID := tr["trace_id"].(string)
	if !strings.HasPrefix(traceID, "tr-") {
		t.Errorf("trace_id = %q, want tr- prefix", traceID)
	}

	// balances moved
	_, ga := do(t, mux, "GET", "/wallets/"+aid, nil)
	_, gb := do(t, mux, "GET", "/wallets/"+bid, nil)
	if ga["balance_minor"].(float64) != 950_000 || gb["balance_minor"].(float64) != 50_000 {
		t.Errorf("balances after transfer: a=%v b=%v, want 950000/50000", ga["balance_minor"], gb["balance_minor"])
	}

	code, gt := do(t, mux, "GET", "/transfers/"+tr["id"].(string), nil)
	if code != http.StatusOK {
		t.Fatalf("GET /transfers/:id = %d, want 200", code)
	}
	if !strings.HasPrefix(gt["trace_id"].(string), "tr-") {
		t.Errorf("GET transfer trace_id = %q, want tr- prefix", gt["trace_id"])
	}
}

// TestL1Idempotency covers TRF-002 (same key → same id, no double debit).
func TestL1Idempotency(t *testing.T) {
	mux := l1Mux()
	_, a := do(t, mux, "POST", "/wallets", map[string]any{"label": "a"})
	_, b := do(t, mux, "POST", "/wallets", map[string]any{"label": "b"})
	aid, bid := a["id"].(string), b["id"].(string)
	do(t, mux, "POST", "/wallets/"+aid+"/seed", map[string]any{"amount_minor": 1_000_000})

	body := map[string]any{"from_wallet_id": aid, "to_wallet_id": bid, "amount_minor": 10_000, "idempotency_key": "idem-dup"}
	c1, t1 := do(t, mux, "POST", "/transfers", body)
	c2, t2 := do(t, mux, "POST", "/transfers", body)
	if c1 != http.StatusCreated {
		t.Fatalf("first transfer = %d, want 201", c1)
	}
	if c2 != http.StatusOK && c2 != http.StatusCreated {
		t.Fatalf("second transfer = %d, want 200/201", c2)
	}
	if t1["id"] != t2["id"] {
		t.Errorf("idempotent ids differ: %v vs %v", t1["id"], t2["id"])
	}
	// only one debit
	_, ga := do(t, mux, "GET", "/wallets/"+aid, nil)
	if ga["balance_minor"].(float64) != 990_000 {
		t.Errorf("balance after idempotent retry = %v, want 990000 (single debit)", ga["balance_minor"])
	}
}

// TestL1InsufficientFunds covers TRF-003 (422, no balance mutation).
func TestL1InsufficientFunds(t *testing.T) {
	mux := l1Mux()
	_, a := do(t, mux, "POST", "/wallets", map[string]any{"label": "a"})
	_, b := do(t, mux, "POST", "/wallets", map[string]any{"label": "b"})
	aid, bid := a["id"].(string), b["id"].(string)
	do(t, mux, "POST", "/wallets/"+aid+"/seed", map[string]any{"amount_minor": 1_000})

	code, _ := do(t, mux, "POST", "/transfers", map[string]any{
		"from_wallet_id": aid, "to_wallet_id": bid, "amount_minor": 999_000_000_000, "idempotency_key": "idem-insuf",
	})
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("insufficient funds = %d, want 422", code)
	}
	_, ga := do(t, mux, "GET", "/wallets/"+aid, nil)
	if ga["balance_minor"].(float64) != 1_000 {
		t.Errorf("balance after failed transfer = %v, want 1000 (unchanged)", ga["balance_minor"])
	}
}

// TestL1TracesAndEvents covers TRF-009 and EVT-004.
func TestL1TracesAndEvents(t *testing.T) {
	mux := l1Mux()
	_, a := do(t, mux, "POST", "/wallets", map[string]any{"label": "a"})
	_, b := do(t, mux, "POST", "/wallets", map[string]any{"label": "b"})
	aid, bid := a["id"].(string), b["id"].(string)
	do(t, mux, "POST", "/wallets/"+aid+"/seed", map[string]any{"amount_minor": 1_000_000})
	_, tr := do(t, mux, "POST", "/transfers", map[string]any{
		"from_wallet_id": aid, "to_wallet_id": bid, "amount_minor": 50_000, "idempotency_key": "idem-trace",
	})
	traceID := tr["trace_id"].(string)

	code, view := do(t, mux, "GET", "/traces/"+traceID, nil)
	if code != http.StatusOK {
		t.Fatalf("GET /traces/:id = %d, want 200", code)
	}
	if view["trace_id"] != traceID {
		t.Errorf("trace_id = %v, want %v", view["trace_id"], traceID)
	}
	tl, ok := view["timeline"].([]any)
	if !ok || len(tl) == 0 {
		t.Fatalf("timeline empty or wrong type: %T %v", view["timeline"], view["timeline"])
	}

	code, ev := do(t, mux, "GET", "/events/history?limit=10", nil)
	if code != http.StatusOK {
		t.Fatalf("GET /events/history = %d, want 200", code)
	}
	events, ok := ev["events"].([]any)
	if !ok || len(events) == 0 {
		t.Fatalf("events empty: %v", ev["events"])
	}
	first := events[0].(map[string]any)
	if _, ok := first["trace_id"]; !ok {
		t.Error("event missing trace_id")
	}
	if _, ok := first["correlation_id"]; !ok {
		t.Error("event missing correlation_id")
	}
}

// TestL0Unchanged asserts the L0 surface still passes with L1 mounted.
func TestL0Unchanged(t *testing.T) {
	mux := l1Mux()
	code, h := do(t, mux, "GET", "/health", nil)
	if code != http.StatusOK || h["status"] != "ok" || h["simulated"] != true || h["production_allowed"] != false {
		t.Fatalf("L0 health changed: %d %v", code, h)
	}
	code, m := do(t, mux, "GET", "/.well-known/banza/operator.json", nil)
	if code != http.StatusOK || m["simulated"] != true || m["production_allowed"] != false {
		t.Fatalf("L0 manifest changed: %d %v", code, m)
	}
}

// TestL1DisabledByDefault asserts the public L0 sandbox does not expose L1
// endpoints unless explicitly enabled.
func TestL1DisabledByDefault(t *testing.T) {
	t.Setenv("SANDBOX_L1_ENABLED", "")
	mux := newMux() // env-gated production mux
	code, _ := do(t, mux, "POST", "/wallets", map[string]any{"label": "x"})
	if code != http.StatusNotFound && code != http.StatusMethodNotAllowed {
		t.Errorf("L1 should be OFF by default: POST /wallets = %d, want 404/405", code)
	}
}
