package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/handler"
	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/go-chi/chi/v5"
)

// RA-047. The developer-key path was given tenant isolation when ADR-047
// introduced it; the merchant-JWT path never was. Measured on the deployed
// Sandbox before the fix, merchant B could create a link payable to merchant A,
// read A's private record, list A's links, and CANCEL A's link — the cancellation
// took effect, leaving A unable to be paid through it.
//
// Every test below asserts that the SERVICE IS NOT REACHED for a foreign
// resource. Asserting only the status code would pass even if the mutation had
// already happened.

const (
	ownerID    = "merchant-owner"
	attackerID = "merchant-attacker"
	linkID     = "6b1f3c2e-8a4d-4c1b-9e2f-7d5a0b3c9e11" // a well-formed id, so a 404 here is ownership, not a malformed id
)

type linkSvcSpy struct {
	created    int
	cancelled  int
	markedUsed int
	listedFor  []string
	link       *service.PaymentLink
}

func (s *linkSvcSpy) Create(context.Context, service.CreatePaymentLinkRequest) (*service.PaymentLink, error) {
	s.created++
	return s.link, nil
}
func (s *linkSvcSpy) Get(context.Context, string) (*service.PaymentLink, error) { return s.link, nil }
func (s *linkSvcSpy) GetBySlug(context.Context, string) (*service.PaymentLink, error) {
	return s.link, nil
}
func (s *linkSvcSpy) List(_ context.Context, req service.ListPaymentLinksRequest) (*service.PaymentLinkListPage, error) {
	s.listedFor = append(s.listedFor, req.MerchantID)
	return &service.PaymentLinkListPage{}, nil
}
func (s *linkSvcSpy) Cancel(context.Context, string) (*service.PaymentLink, error) {
	s.cancelled++
	return s.link, nil
}
func (s *linkSvcSpy) MarkUsed(context.Context, string) (*service.PaymentLink, error) {
	s.markedUsed++
	return s.link, nil
}

func ownedLinkSpy() *linkSvcSpy {
	return &linkSvcSpy{link: &service.PaymentLink{ID: linkID, MerchantID: ownerID, Slug: "abc123"}}
}

func withRouteID(r *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// Creating a link payable to ANOTHER merchant must be refused, and must never
// reach the service.
func TestPaymentLink_CreateForAnotherMerchantRefused(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	body := map[string]any{"merchant_id": ownerID, "wallet_id": "w-1", "amount_minor": 1000, "currency": "AOA"}

	w := httptest.NewRecorder()
	h.Create(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payment-links", jsonBody(body)), attackerID))

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
	if spy.created != 0 {
		t.Error("the service must not be reached — a refusal after creation is not a refusal")
	}
}

// Omitting merchant_id must bind to the principal rather than failing, so the
// honest client is not forced to restate its own identity.
func TestPaymentLink_CreateBindsToPrincipal(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil).WithWallets(walletsOwnedBy{"w-1": ownerID})
	body := map[string]any{"wallet_id": "w-1", "amount_minor": 1000, "currency": "AOA"}

	w := httptest.NewRecorder()
	h.Create(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payment-links", jsonBody(body)), ownerID))

	if spy.created != 1 {
		t.Fatalf("owner's own create must succeed; status %d body %s", w.Code, w.Body.String())
	}
}

// Reading another merchant's link must be indistinguishable from missing.
func TestPaymentLink_CrossMerchantReadIsNotFound(t *testing.T) {
	h := handler.NewPaymentLinkHandler(ownedLinkSpy(), nil, nil)
	w := httptest.NewRecorder()
	h.Get(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodGet, "/v1/payment-links/"+linkID, nil), attackerID), linkID))

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 (not 403 — that would confirm the id exists), got %d", w.Code)
	}
	if body := w.Body.String(); contains(body, ownerID) {
		t.Error("the response leaked the owning merchant id")
	}
}

// The destructive one: cancelling another merchant's link must not happen.
func TestPaymentLink_CrossMerchantCancelDoesNotMutate(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	w := httptest.NewRecorder()
	h.Cancel(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodDelete, "/v1/payment-links/"+linkID, nil), attackerID), linkID))

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	if spy.cancelled != 0 {
		t.Fatal("the link was cancelled — this is the deployed defect the fix exists for")
	}
}

// Marking another merchant's link as used would also emit payment_link.paid to
// THEIR webhook endpoints.
func TestPaymentLink_CrossMerchantMarkUsedDoesNotMutate(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	w := httptest.NewRecorder()
	h.MarkUsed(w, withRouteID(withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payment-links/"+linkID+"/mark-used", nil), attackerID), linkID))

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	if spy.markedUsed != 0 {
		t.Fatal("the link was marked used for a merchant that does not own it")
	}
}

// Listing must be scoped to the caller regardless of the query parameter.
func TestPaymentLink_ListIsScopedToPrincipal(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)

	w := httptest.NewRecorder()
	h.List(w, withMerchant(httptest.NewRequest(http.MethodGet, "/v1/payment-links?merchant_id="+ownerID, nil), attackerID))
	if w.Code != http.StatusForbidden {
		t.Fatalf("listing another merchant's links must be refused, got %d", w.Code)
	}
	if len(spy.listedFor) != 0 {
		t.Fatalf("the service was queried for %v", spy.listedFor)
	}

	// Own listing still works, and is scoped to the principal.
	w2 := httptest.NewRecorder()
	h.List(w2, withMerchant(httptest.NewRequest(http.MethodGet, "/v1/payment-links", nil), ownerID))
	if w2.Code != http.StatusOK {
		t.Fatalf("own listing must succeed, got %d: %s", w2.Code, w2.Body.String())
	}
	if len(spy.listedFor) != 1 || spy.listedFor[0] != ownerID {
		t.Errorf("list scoped to %v, want [%s]", spy.listedFor, ownerID)
	}
}

func contains(haystack, needle string) bool {
	var m map[string]any
	_ = json.Unmarshal([]byte(haystack), &m)
	return len(needle) > 0 && len(haystack) > 0 && stringContains(haystack, needle)
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// walletsOwnedBy answers wallet lookups from a fixed ownership map.
type walletsOwnedBy map[string]string

func (m walletsOwnedBy) Get(_ context.Context, id string) (*service.WalletRecord, error) {
	owner, ok := m[id]
	if !ok {
		return nil, service.ErrWalletNotFound
	}
	return &service.WalletRecord{ID: id, MerchantID: owner, Currency: "AOA"}, nil
}

// A Business's own link must pay into its OWN wallet. The wallet id came from
// the body and nothing down to core checked it, and acquiring credits the
// link's wallet: Business A could open a link collecting into Business B's.
func TestPaymentLink_CreateIntoAnotherBusinessWalletIsNotFound(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil).WithWallets(walletsOwnedBy{"w-victim": ownerID})
	body := map[string]any{"wallet_id": "w-victim", "amount_minor": 1000, "currency": "AOA"}
	w := httptest.NewRecorder()
	h.Create(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payment-links", jsonBody(body)), attackerID))
	if w.Code != http.StatusNotFound || spy.created != 0 {
		t.Fatalf("status %d, created %d — the link must never reach the service", w.Code, spy.created)
	}
	if strings.Contains(w.Body.String(), ownerID) {
		t.Fatal("the refusal named the wallet's owner")
	}
}

// Without an ownership check wired, a merchant link is refused, not trusted.
func TestPaymentLink_CreateWithoutWalletCheckFailsClosed(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	body := map[string]any{"wallet_id": "w-1", "amount_minor": 1000, "currency": "AOA"}
	w := httptest.NewRecorder()
	h.Create(w, withMerchant(httptest.NewRequest(http.MethodPost, "/v1/payment-links", jsonBody(body)), ownerID))
	if spy.created != 0 {
		t.Fatal("a link was created with no way to check its wallet")
	}
}

// ── V01: principals other than the owning merchant ──────────────────────────
// A consumer token authenticates on this surface with no merchant id, and the
// ownership checks only ran "if there is a merchant principal". A developer
// key had no branch on list, cancel or mark-used. Both are refused now.

func withConsumer(r *http.Request) *http.Request {
	p := &middleware.Principal{CustomerID: "c-anyone", Scopes: []string{"consumer"}}
	return r.WithContext(middleware.ContextWithPrincipal(r.Context(), p))
}

func withDevOf(r *http.Request, merchantID string, scopes ...string) *http.Request {
	p := &middleware.DeveloperPrincipal{KeyID: "k", Environment: "SANDBOX", KeyStatus: "active", Scopes: scopes,
		Bound: true, MerchantID: merchantID, WalletID: "w", WalletAccountID: "wa"}
	return r.WithContext(middleware.ContextWithDeveloperPrincipal(r.Context(), p))
}

func TestPaymentLink_ConsumerTokenCanDoNothing(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	for name, call := range map[string]func(http.ResponseWriter){
		"list": func(w http.ResponseWriter) {
			h.List(w, withConsumer(httptest.NewRequest(http.MethodGet, "/v1/payment-links?merchant_id="+ownerID, nil)))
		},
		"get": func(w http.ResponseWriter) {
			h.Get(w, withRouteID(withConsumer(httptest.NewRequest(http.MethodGet, "/", nil)), linkID))
		},
		"cancel": func(w http.ResponseWriter) {
			h.Cancel(w, withRouteID(withConsumer(httptest.NewRequest(http.MethodDelete, "/", nil)), linkID))
		},
		"mark-used": func(w http.ResponseWriter) {
			h.MarkUsed(w, withRouteID(withConsumer(httptest.NewRequest(http.MethodPost, "/", nil)), linkID))
		},
	} {
		w := httptest.NewRecorder()
		call(w)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s with a consumer token: got %d, want 401", name, w.Code)
		}
	}
	if len(spy.listedFor) != 0 || spy.cancelled != 0 || spy.markedUsed != 0 {
		t.Fatalf("a consumer token reached the service: listed=%v cancelled=%d marked=%d", spy.listedFor, spy.cancelled, spy.markedUsed)
	}
}

func TestPaymentLink_DeveloperKeyIsBoundToItsOwnMerchant(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)

	// list: the binding's merchant, never the query's
	w := httptest.NewRecorder()
	h.List(w, withDevOf(httptest.NewRequest(http.MethodGet, "/v1/payment-links?merchant_id="+ownerID, nil), attackerID, "payment_links:read"))
	if w.Code != http.StatusForbidden || len(spy.listedFor) != 0 {
		t.Fatalf("a key bound to another merchant listed the owner's links: %d %v", w.Code, spy.listedFor)
	}
	w = httptest.NewRecorder()
	h.List(w, withDevOf(httptest.NewRequest(http.MethodGet, "/v1/payment-links", nil), attackerID, "payment_links:read"))
	if w.Code != http.StatusOK || len(spy.listedFor) != 1 || spy.listedFor[0] != attackerID {
		t.Fatalf("a key must list its own merchant's links: %d %v", w.Code, spy.listedFor)
	}

	// cancel / mark-used another merchant's link: not found, nothing mutated
	w = httptest.NewRecorder()
	h.Cancel(w, withRouteID(withDevOf(httptest.NewRequest(http.MethodDelete, "/", nil), attackerID, "payment_links:write"), linkID))
	if w.Code != http.StatusNotFound || spy.cancelled != 0 {
		t.Fatalf("a key bound to another merchant cancelled the owner's link: %d cancelled=%d", w.Code, spy.cancelled)
	}
	w = httptest.NewRecorder()
	h.MarkUsed(w, withRouteID(withDevOf(httptest.NewRequest(http.MethodPost, "/", nil), attackerID, "payment_links:write"), linkID))
	if w.Code != http.StatusNotFound || spy.markedUsed != 0 {
		t.Fatalf("a key bound to another merchant marked the owner's link used: %d marked=%d", w.Code, spy.markedUsed)
	}

	// its own link, with the write scope: allowed
	w = httptest.NewRecorder()
	h.Cancel(w, withRouteID(withDevOf(httptest.NewRequest(http.MethodDelete, "/", nil), ownerID, "payment_links:write"), linkID))
	if w.Code != http.StatusOK || spy.cancelled != 1 {
		t.Fatalf("the owner's key must cancel its own link: %d", w.Code)
	}
	// without the write scope: refused before any lookup
	w = httptest.NewRecorder()
	h.MarkUsed(w, withRouteID(withDevOf(httptest.NewRequest(http.MethodPost, "/", nil), ownerID, "payment_links:read"), linkID))
	if w.Code != http.StatusForbidden || spy.markedUsed != 0 {
		t.Fatalf("mark-used without payment_links:write: %d", w.Code)
	}
}

func TestPaymentLink_NoPrincipalIsRefused(t *testing.T) {
	spy := ownedLinkSpy()
	h := handler.NewPaymentLinkHandler(spy, nil, nil)
	w := httptest.NewRecorder()
	h.List(w, httptest.NewRequest(http.MethodGet, "/v1/payment-links?merchant_id="+ownerID, nil))
	if w.Code != http.StatusUnauthorized || len(spy.listedFor) != 0 {
		t.Fatalf("no principal listed links: %d", w.Code)
	}
}
