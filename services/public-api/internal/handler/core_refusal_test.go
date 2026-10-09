package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A Sandbox pilot limit is a refusal, not an outage. Live case: 42 000 Kz
// against the per-payment limit was answered 500 INTERNAL_ERROR, and the app
// told the payer it could not confirm whether the payment had completed.
func TestCoreRefusal_PilotLimitIsA422WithItsCode(t *testing.T) {
	core := fmt.Errorf("core-api error 422: %s",
		`{"error":{"code":"PILOT_LIMIT_PER_PAYMENT_EXCEEDED","message":"This operation exceeds the controlled pilot limit."}}`)
	w := httptest.NewRecorder()
	if !respondCoreRefusal(w, httptest.NewRequest(http.MethodPost, "/v1/payment-links/x/pay", nil), core) {
		t.Fatal("a pilot-limit refusal was not recognised")
	}
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status %d, want 422", w.Code)
	}
	if !strings.Contains(w.Body.String(), "PILOT_LIMIT_PER_PAYMENT_EXCEEDED") {
		t.Fatalf("the code the app maps is missing: %s", w.Body.String())
	}
	// …and names the maximum, from the generated constant: Kz 50 000.
	if !strings.Contains(w.Body.String(), `"limit_minor":5000000`) {
		t.Fatalf("the per-payment maximum is not stated: %s", w.Body.String())
	}
}

// The maximum a refusal names is the one Core enforces, and both sides of a
// payment share it.
func TestCoreRefusal_PerOperationMaximumIs50000Kz(t *testing.T) {
	if pilotPerPaymentMinor != 50_000_00 || pilotPerReceiveMinor != pilotPerPaymentMinor {
		t.Fatalf("per-payment %d, per-receive %d: want both 5000000", pilotPerPaymentMinor, pilotPerReceiveMinor)
	}
	// An aggregate limit is never given a number.
	w := httptest.NewRecorder()
	respondCoreRefusal(w, httptest.NewRequest(http.MethodPost, "/", nil),
		fmt.Errorf("core-api error 422: %s", `{"error":{"code":"PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED"}}`))
	if strings.Contains(w.Body.String(), "limit_minor") {
		t.Fatalf("an aggregate limit was given a number: %s", w.Body.String())
	}
}

func TestCoreRefusal_NeverForwardsCoresMessage(t *testing.T) {
	// INSUFFICIENT_FUNDS carries the balance in its message and has its own
	// mapping; it must not leak through this path, and nothing Core wrote may.
	leaky := fmt.Errorf("core-api error 422: %s",
		`{"error":{"code":"ACCOUNT_FROZEN","message":"available 123456, requested 4200000"}}`)
	w := httptest.NewRecorder()
	if !respondCoreRefusal(w, httptest.NewRequest(http.MethodPost, "/", nil), leaky) {
		t.Fatal("ACCOUNT_FROZEN should be passed through")
	}
	if strings.Contains(w.Body.String(), "123456") || strings.Contains(w.Body.String(), "4200000") {
		t.Fatalf("Core's message reached the client: %s", w.Body.String())
	}
}

func TestCoreRefusal_EverythingElseStaysAnError(t *testing.T) {
	for _, err := range []error{
		nil,
		errors.New("dial tcp: connection refused"),
		errors.New(`core-api error 500: {"error":{"code":"PILOT_LIMIT_PER_PAYMENT_EXCEEDED"}}`),
		errors.New(`core-api error 422: {"error":{"code":"SOMETHING_INTERNAL"}}`),
		errors.New(`core-api error 422: {"error":{"code":"INSUFFICIENT_FUNDS","message":"available 1, requested 2"}}`),
		errors.New(`core-api error 422: not json`),
	} {
		w := httptest.NewRecorder()
		if respondCoreRefusal(w, httptest.NewRequest(http.MethodPost, "/", nil), err) {
			t.Fatalf("%v was answered as a refusal", err)
		}
		if w.Body.Len() != 0 {
			t.Fatalf("%v wrote a response while declining to handle it", err)
		}
	}
}

// Every consumer pay path consults it before falling back to a 500.
func TestCoreRefusal_EveryPayHandlerUsesIt(t *testing.T) {
	for _, f := range []string{"payment_links.go", "consumer_pay_link_handler.go", "qr_pay.go", "transfers.go"} {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(src), "if respondCoreRefusal(w, r, err) {") {
			t.Fatalf("%s falls through to a 500 without asking whether Core refused the payment", f)
		}
	}
}

// A developer's test-payer top-up is a top-up like any other: one operation,
// bounded by the same Sandbox per-operation maximum Core enforces.
func TestTestPayerTopUpMaximumIsTheSandboxPerOperationMaximum(t *testing.T) {
	if service.TestPayerMaxTopUpMinor != pilotTopUpPerOperationMinor || pilotTopUpPerOperationMinor != pilotPerPaymentMinor {
		t.Fatalf("test-payer top-up maximum %d, Sandbox per-operation maximum %d",
			service.TestPayerMaxTopUpMinor, pilotPerPaymentMinor)
	}
}
