package handler

// Developer-key payment authorization tests (ADR-047 / RT04B §6/§8) at the
// canonical payment-session route. A developer key must derive its payee ONLY
// from the Project binding, hold the right scope, and be bound — every violation
// fails closed before any session is created.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// devReq builds a payment-session request carrying a developer principal.
func devReq(method, target, body string, p *middleware.DeveloperPrincipal) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p))
}

func boundDevPrincipal(scopes ...string) *middleware.DeveloperPrincipal {
	return &middleware.DeveloperPrincipal{
		KeyID: "k1", Environment: "SANDBOX", ProjectSlug: "proj", KeyStatus: "active",
		Scopes: scopes, Bound: true, MerchantID: "bound-merchant",
		WalletID: "bound-wallet", WalletAccountID: "bound-wa",
	}
}

func TestDevKeySession_PayeeDerivedFromBinding(t *testing.T) {
	h := psHandler("bound-merchant", false)
	// A clean request (no payee fields) succeeds; the payee is the binding's.
	rec := httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"purpose":"DONATION","amount_minor":50000}`, boundDevPrincipal("payment_sessions:write")))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	// The created session credits the BINDING's wallet_account — not anything the
	// client could choose.
	if !strings.Contains(rec.Body.String(), `"wallet_account_id":"bound-wa"`) {
		t.Fatalf("payee must derive from the binding wallet account: %s", rec.Body.String())
	}
}

// Choosing the OWNER stays forbidden. These fields would let a client name who
// receives the money, which is authority, not selection.
func TestDevKeySession_RejectsClientSuppliedOwner(t *testing.T) {
	h := psHandler("bound-merchant", false)
	for _, body := range []string{
		`{"merchant_id":"attacker-merchant","amount_minor":1000}`,
		`{"wallet_id":"attacker-wallet","amount_minor":1000}`,
		`{"payee":"attacker","amount_minor":1000}`,
		`{"payee_wallet":"attacker","amount_minor":1000}`,
	} {
		rec := httptest.NewRecorder()
		h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions", body, boundDevPrincipal("payment_sessions:write")))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "PAYEE_NOT_ALLOWED") {
			t.Fatalf("client owner %s must be rejected, got %d (%s)", body, rec.Code, rec.Body.String())
		}
	}
}

// Choosing a SUB-ACCOUNT is allowed — but only among the bound wallet's own
// accounts. A foreign id is NOT_FOUND rather than FORBIDDEN: confirming that an
// id exists but belongs to someone else would let one project enumerate
// another's accounts by status code alone.
func TestDevKeySession_SubAccountMustBelongToTheBoundWallet(t *testing.T) {
	accounts := &fakeAccountLookup{byID: map[string]*service.WalletAccount{
		"mine-wa":    {ID: "mine-wa", WalletID: "bound-wallet"},
		"foreign-wa": {ID: "foreign-wa", WalletID: "someone-elses-wallet"},
	}}
	h := NewPaymentSessionHandler(&fakePaymentSessions{merchantID: "bound-merchant"}, activeMerchant(), accounts)

	rec := httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"wallet_account_id":"mine-wa","amount_minor":1000}`, boundDevPrincipal("payment_sessions:write")))
	if rec.Code != http.StatusCreated {
		t.Fatalf("own sub-account must be accepted, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"wallet_account_id":"mine-wa"`) {
		t.Fatalf("the selected sub-account must be credited: %s", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"wallet_account_id":"foreign-wa","amount_minor":1000}`, boundDevPrincipal("payment_sessions:write")))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("foreign sub-account must be NOT_FOUND, got %d (%s)", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"wallet_account_id":"does-not-exist","amount_minor":1000}`, boundDevPrincipal("payment_sessions:write")))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown sub-account must be NOT_FOUND, got %d", rec.Code)
	}
}

// Omitting it keeps the previous behaviour: the binding's default account.
func TestDevKeySession_OmittedSubAccountUsesTheBindingDefault(t *testing.T) {
	h := psHandler("bound-merchant", false)
	rec := httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"amount_minor":1000}`, boundDevPrincipal("payment_sessions:write")))
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"wallet_account_id":"bound-wa"`) {
		t.Fatalf("omitted id must use the binding default, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// A read-only lookup, distinct from the fuller wallet-account fake elsewhere:
// this path only ever resolves an id back to its wallet.
type fakeAccountLookup struct {
	byID map[string]*service.WalletAccount
}

func (f *fakeAccountLookup) Get(_ context.Context, id string) (*service.WalletAccount, error) {
	return f.byID[id], nil
}

func TestDevKeySession_MissingScopeFailsBeforeCreate(t *testing.T) {
	h := psHandler("bound-merchant", false)
	// identity-only key (no payment scope) must not create a session.
	rec := httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"amount_minor":1000}`, boundDevPrincipal("identity:read")))
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "INSUFFICIENT_SCOPE") {
		t.Fatalf("missing scope must 403 before create, got %d (%s)", rec.Code, rec.Body.String())
	}
	// read scope does not imply write.
	rec = httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"amount_minor":1000}`, boundDevPrincipal("payment_sessions:read")))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("read scope must not authorize write, got %d", rec.Code)
	}
}

func TestDevKeySession_UnboundFailsClosed(t *testing.T) {
	h := psHandler("bound-merchant", false)
	unbound := boundDevPrincipal("payment_sessions:write")
	unbound.Bound = false
	unbound.MerchantID, unbound.WalletID, unbound.WalletAccountID = "", "", ""
	rec := httptest.NewRecorder()
	h.Create(rec, devReq("POST", "https://x/v1/business/payment-sessions",
		`{"amount_minor":1000}`, unbound))
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "PAYMENTS_UNAVAILABLE") {
		t.Fatalf("unbound project must fail closed with PAYMENTS_UNAVAILABLE, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestDevKeySession_TenantIsolationOnRead(t *testing.T) {
	// The session belongs to a DIFFERENT merchant than the key's binding.
	h := psHandler("other-merchant", false)
	rec := httptest.NewRecorder()
	req := devReq("GET", "https://x/v1/business/payment-sessions/sess-1", "", boundDevPrincipal("payment_sessions:read"))
	// chi URL param needs to resolve {id}; the handler reads it via chi.URLParam,
	// which returns "" without a route context — load() still fetches by "" and the
	// fake returns a session owned by other-merchant, so the tenant check applies.
	h.Get(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant read must be 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}
