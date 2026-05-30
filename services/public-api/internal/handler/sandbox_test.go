package handler

// Invariant tests for SANDBOX-SAFETY-001 / SANDBOX-002.
//
// Rule: sandbox funding endpoints MUST return 403 in LIVE and 200/400 in SANDBOX.
// Rule: rate limiter caps sandbox fund at sandboxFundDailyLimit per 24 h.
// Rule: requireSandbox is enforced independently of auth.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banza-protocol/banzami/services/public-api/internal/middleware"
)

// buildSandboxHandler creates a SandboxHandler with the given environment.
// core is nil — tests that reach the core call will get 500, which is fine:
// the invariant being tested is always at the env-guard or rate-limit layer.
func buildSandboxHandler(env string) *SandboxHandler {
	return &SandboxHandler{
		core:        nil,
		environment: env,
		fundLimiter: NewTransferRateLimiter(sandboxFundDailyLimit, 0),
	}
}

func sandboxFundRequest(t *testing.T, amountMinor int64) *http.Request {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"amount_minor": amountMinor, "currency": "AOA"})
	r := httptest.NewRequest(http.MethodPost, "/v1/sandbox/fund", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	return r
}

func withConsumer(r *http.Request, id string) *http.Request {
	ctx := middleware.InjectConsumer(r.Context(), &middleware.Consumer{ID: id})
	return r.WithContext(ctx)
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-001: sandboxFund returns 403 in LIVE
// ---------------------------------------------------------------------------

func TestSandboxFund_LiveEnvironmentReturns403(t *testing.T) {
	h := buildSandboxHandler("LIVE")
	r := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-1")
	w := httptest.NewRecorder()

	h.FundWallet(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 in LIVE, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "SANDBOX_ONLY" {
		t.Errorf("expected error code SANDBOX_ONLY, got %v", resp["code"])
	}
}

func TestSandboxFund_ProductionEnvironmentReturns403(t *testing.T) {
	h := buildSandboxHandler("PRODUCTION")
	r := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-1")
	w := httptest.NewRecorder()

	h.FundWallet(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 in PRODUCTION, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-002: sandboxFund succeeds in SANDBOX
// ---------------------------------------------------------------------------

func TestSandboxFund_SandboxEnvironmentAllowed(t *testing.T) {
	h := buildSandboxHandler("SANDBOX")
	r := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-1")
	w := httptest.NewRecorder()

	// nil core will panic once past the sandbox/auth/rate gates — that is expected.
	// We only care that the sandbox gate did NOT return 403.
	func() {
		defer func() { recover() }() //nolint:errcheck
		h.FundWallet(w, r)
	}()

	if w.Code == http.StatusForbidden {
		t.Errorf("sandbox fund should not be blocked in SANDBOX environment")
	}
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-003: sandboxFund requires authentication
// ---------------------------------------------------------------------------

func TestSandboxFund_NoAuthReturns401(t *testing.T) {
	h := buildSandboxHandler("SANDBOX")
	r := sandboxFundRequest(t, 1_000_000) // no consumer in context
	w := httptest.NewRecorder()

	h.FundWallet(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without auth, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-004: rate limiter blocks after daily cap
// ---------------------------------------------------------------------------

func TestSandboxFund_RateLimitEnforced(t *testing.T) {
	limiter := NewTransferRateLimiter(3, time.Hour) // cap at 3 per window
	h := &SandboxHandler{
		environment: "SANDBOX",
		core:        nil,
		fundLimiter: limiter,
	}

	consumerID := "rate-test-consumer"
	// Exhaust the 3-call allowance (calls panic at nil core but the rate gate must pass).
	for i := 0; i < 3; i++ {
		r := withConsumer(sandboxFundRequest(t, 1_000_000), consumerID)
		w := httptest.NewRecorder()
		func() {
			defer func() { recover() }() //nolint:errcheck
			h.FundWallet(w, r)
		}()
		if w.Code == http.StatusTooManyRequests {
			t.Errorf("call %d should not be rate-limited yet", i+1)
		}
	}

	// 4th call must be rate-limited.
	r := withConsumer(sandboxFundRequest(t, 1_000_000), consumerID)
	w := httptest.NewRecorder()
	h.FundWallet(w, r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429 after cap exceeded, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "RATE_LIMITED" {
		t.Errorf("expected RATE_LIMITED code, got %v", resp["code"])
	}
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-005: different consumers have independent rate limit buckets
// ---------------------------------------------------------------------------

func TestSandboxFund_RateLimitPerConsumer(t *testing.T) {
	limiter := NewTransferRateLimiter(1, time.Hour)
	h := &SandboxHandler{environment: "SANDBOX", core: nil, fundLimiter: limiter}

	// Consumer A exhausts their limit (panics at nil core — expected).
	r1 := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-A")
	w1 := httptest.NewRecorder()
	func() {
		defer func() { recover() }() //nolint:errcheck
		h.FundWallet(w1, r1)
	}()
	// Second call for A is rate-limited.
	r2 := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-A")
	w2 := httptest.NewRecorder()
	h.FundWallet(w2, r2)
	if w2.Code != http.StatusTooManyRequests {
		t.Errorf("consumer-A second call: expected 429, got %d", w2.Code)
	}

	// Consumer B still gets through (not 429); panics at nil core — expected.
	r3 := withConsumer(sandboxFundRequest(t, 1_000_000), "consumer-B")
	w3 := httptest.NewRecorder()
	func() {
		defer func() { recover() }() //nolint:errcheck
		h.FundWallet(w3, r3)
	}()
	if w3.Code == http.StatusTooManyRequests {
		t.Errorf("consumer-B should not be rate-limited by consumer-A's usage")
	}
}

// ---------------------------------------------------------------------------
// INV-SANDBOX-006: zero and negative amounts rejected before env check
// ---------------------------------------------------------------------------

func TestSandboxFund_ZeroAmountReturns400(t *testing.T) {
	h := buildSandboxHandler("SANDBOX")
	r := withConsumer(sandboxFundRequest(t, 0), "consumer-1")
	w := httptest.NewRecorder()

	h.FundWallet(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for zero amount, got %d", w.Code)
	}
}
