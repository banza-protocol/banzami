package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// Transferências under a developer credential (ADR-052).
//
// The product is deliberately the smallest safe one: money between two child
// accounts of the SAME bound owner. These pin the gateway half of that — the
// owner is never taken from the request, each rejection happens before any
// service call, and a transfer scope is required in its own right.
//
// Core re-validates both accounts against the same merchant, so a bypass here
// still meets a refusal there. That is asserted separately in Core.

type devTransfers struct {
	called      bool
	sawMerchant string
	sawSource   string
	sawDest     string
}

func (f *devTransfers) Create(_ context.Context, in service.CreateWalletAccountTransferInput) (*service.WalletAccountTransfer, error) {
	f.called = true
	f.sawMerchant = in.MerchantID
	f.sawSource = in.SourceWalletAccountID
	f.sawDest = in.DestinationWalletAccountID
	return &service.WalletAccountTransfer{
		ID:                         "wat_1",
		SourceWalletAccountID:      in.SourceWalletAccountID,
		DestinationWalletAccountID: in.DestinationWalletAccountID,
		AmountMinor:                in.AmountMinor,
		Currency:                   in.Currency,
		Status:                     "COMPLETED",
	}, nil
}

func devTransferReq(body string, scopes ...string) *http.Request {
	req := httptest.NewRequest("POST", "https://x/v1/transfers", strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), boundDevPrincipal(scopes...)))
}

const okTransfer = `{"source_wallet_account_id":"wa_a","destination_wallet_account_id":"wa_b",` +
	`"amount_minor":50000,"currency":"AOA","idempotency_key":"k1"}`

func TestDevKeyTransfer_OwnerComesFromTheBinding(t *testing.T) {
	f := &devTransfers{}
	h := NewWalletAccountTransferHandler(f)

	rec := httptest.NewRecorder()
	h.Create(rec, devTransferReq(okTransfer, "transfers:write"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	// There is no merchant field on this route; the owner Core will validate
	// against is the binding's.
	if f.sawMerchant != "bound-merchant" {
		t.Fatalf("Core asked to move money for %q — must be the binding's merchant", f.sawMerchant)
	}
	// The account ids are pure selection and are passed through untouched.
	if f.sawSource != "wa_a" || f.sawDest != "wa_b" {
		t.Errorf("accounts altered in transit: %q → %q", f.sawSource, f.sawDest)
	}
}

func TestDevKeyTransfer_NeedsItsOwnScope(t *testing.T) {
	for _, scope := range []string{
		"payment_sessions:write",
		"wallet_accounts:create",
		"refunds:write",
		"application_settlements:write",
		"transfers:read",
	} {
		f := &devTransfers{}
		h := NewWalletAccountTransferHandler(f)
		rec := httptest.NewRecorder()
		h.Create(rec, devTransferReq(okTransfer, scope))
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s must not authorise a transfer: want 403, got %d", scope, rec.Code)
		}
		if f.called {
			t.Errorf("%s reached the service — authority is checked too late", scope)
		}
	}
}

func TestDevKeyTransfer_UnboundProjectCannotTransfer(t *testing.T) {
	f := &devTransfers{}
	h := NewWalletAccountTransferHandler(f)
	dp := boundDevPrincipal("transfers:write")
	dp.Bound, dp.MerchantID = false, ""
	req := httptest.NewRequest("POST", "https://x/v1/transfers", strings.NewReader(okTransfer))
	req = req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), dp))

	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("unbound project: want 403, got %d", rec.Code)
	}
	if f.called {
		t.Error("an unbound project reached the transfer service")
	}
}

func TestDevKeyTransfer_RejectsUnsafeAmountsAndShapes(t *testing.T) {
	cases := []struct{ name, body string }{
		{"zero", `{"source_wallet_account_id":"a","destination_wallet_account_id":"b","amount_minor":0,"currency":"AOA","idempotency_key":"k"}`},
		// A negative amount would invert the posting and move money the other way.
		{"negative", `{"source_wallet_account_id":"a","destination_wallet_account_id":"b","amount_minor":-50000,"currency":"AOA","idempotency_key":"k"}`},
		// Self-transfer balances to nothing yet would appear as a movement.
		{"self", `{"source_wallet_account_id":"a","destination_wallet_account_id":"a","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`},
		{"missing source", `{"destination_wallet_account_id":"b","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`},
		{"missing destination", `{"source_wallet_account_id":"a","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`},
		{"bad currency", `{"source_wallet_account_id":"a","destination_wallet_account_id":"b","amount_minor":100,"currency":"kwanza","idempotency_key":"k"}`},
		// Required, not defaulted: a generated key makes every retry a new transfer.
		{"missing idempotency key", `{"source_wallet_account_id":"a","destination_wallet_account_id":"b","amount_minor":100,"currency":"AOA"}`},
	}
	for _, tc := range cases {
		f := &devTransfers{}
		h := NewWalletAccountTransferHandler(f)
		rec := httptest.NewRecorder()
		h.Create(rec, devTransferReq(tc.body, "transfers:write"))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: want 400, got %d (%s)", tc.name, rec.Code, rec.Body.String())
		}
		if f.called {
			t.Errorf("%s: reached the service — a rejected transfer must move nothing", tc.name)
		}
	}
}

func TestDevKeyTransfer_MerchantInBodyIsIgnored(t *testing.T) {
	// No merchant field exists on this route. Smuggling one must not change who
	// the money moves for.
	f := &devTransfers{}
	h := NewWalletAccountTransferHandler(f)
	body := `{"merchant_id":"someone-else","source_wallet_account_id":"wa_a",` +
		`"destination_wallet_account_id":"wa_b","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`

	rec := httptest.NewRecorder()
	h.Create(rec, devTransferReq(body, "transfers:write"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if f.sawMerchant != "bound-merchant" {
		t.Fatalf("a supplied merchant_id changed the owner to %q", f.sawMerchant)
	}
}
