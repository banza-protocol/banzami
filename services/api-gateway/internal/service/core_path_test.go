package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
)

// A path parameter reaches the service already decoded by the router, so a
// refund id written "<id>%3Fmerchant_id=<victim>&x=" arrives with a literal '?'.
// Pasted in front of "?merchant_id=<caller>", it moved the caller's scope out of
// the value core reads and put the victim's there (A3-01). Every call site now
// escapes what it pastes, and the client refuses a path whose shape an
// identifier could have changed.

// coreRecorder answers every request with `body` and records the raw
// request-URI core would have parsed.
func coreRecorder(t *testing.T, body string) (*CoreApiClient, func() []string) {
	t.Helper()
	var mu sync.Mutex
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.URL.RequestURI())
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return NewCoreApiClient(srv.URL, "k"), func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), seen...)
	}
}

func TestRefundGet_AnInjectedScopeNeverReachesCore(t *testing.T) {
	client, seen := coreRecorder(t, `{"id":"r"}`)
	refunds := NewCoreApiRefundService(client)

	const victimRefund = "0b7d6f2e-1111-4c1a-9d6e-2a3b4c5d6e7f"
	const victimMerchant = "5f0e1d2c-2222-4b3a-8c9d-0e1f2a3b4c5d"
	const caller = "9a8b7c6d-3333-4e5f-a0b1-c2d3e4f5a6b7"

	_, _ = refunds.Get(context.Background(),
		victimRefund+"?merchant_id="+victimMerchant+"&x=", caller)
	for _, uri := range seen() {
		u, err := url.ParseRequestURI(uri)
		if err != nil {
			t.Fatalf("core received an unparseable request: %s", uri)
		}
		if got := u.Query()["merchant_id"]; len(got) != 1 || got[0] != caller {
			t.Fatalf("core was scoped by %v, want only the caller: %s", got, uri)
		}
	}

	// The honest request carries exactly one merchant_id — the caller's.
	if _, err := refunds.Get(context.Background(), victimRefund, caller); err != nil {
		t.Fatalf("a well-formed refund read failed: %v", err)
	}
	last := seen()[len(seen())-1]
	if want := "/internal/v1/refunds/" + victimRefund + "?merchant_id=" + caller; last != want {
		t.Fatalf("got %s, want %s", last, want)
	}
}

func TestRefundList_ASourceIdCannotAddAScope(t *testing.T) {
	client, seen := coreRecorder(t, `{"data":[]}`)
	refunds := NewCoreApiRefundService(client)
	const caller = "9a8b7c6d-3333-4e5f-a0b1-c2d3e4f5a6b7"

	_, _ = refunds.List(context.Background(), "s&merchant_id=victim", caller, 20)
	for _, uri := range seen() {
		if contains(uri, "merchant_id=victim") {
			t.Fatalf("a source_id added a merchant scope: %s", uri)
		}
	}
}

func TestTransactionGet_IsScopedToTheCaller(t *testing.T) {
	// Core answers with another merchant's transaction (a core that forgot to
	// scope): the gateway still refuses to hand it over.
	client, seen := coreRecorder(t, `{"id":"t","merchant_id":"someone-else","amount":{"amount_minor":1,"currency":"AOA"}}`)
	txs := NewCoreApiTransactionService(client)

	_, err := txs.Get(context.Background(), "me", "t", "SANDBOX")
	if !errors.Is(err, ErrTransactionNotFound) {
		t.Fatalf("another merchant's transaction was returned (err=%v)", err)
	}
	if got := seen()[0]; got != "/internal/v1/transactions/t?merchant_id=me" {
		t.Fatalf("the owner was not sent to core: %s", got)
	}
}

func TestCorePath_Shapes(t *testing.T) {
	for _, tc := range []struct {
		path string
		ok   bool
	}{
		{"/internal/v1/refunds/abc?merchant_id=m", true},
		{"/internal/v1/merchant-profiles/by-handle/%2564oa", true},
		{"/internal/v1/refunds?limit=20&source_id=s%26merchant_id%3Dv&merchant_id=m", true},
		{"/internal/v1/refunds/abc?merchant_id=v&x=?merchant_id=m", false}, // second '?'
		{"/internal/v1/refunds?limit=20&source_id=s&merchant_id=v&merchant_id=m", false},
		{"/internal/v1/wallets/../merchants/x", false},
		{"/internal/v1/wallets/%2e%2e/merchants/x", false},
		{"/internal/v1/wallets/x#frag", false},
		{"/internal/v1/wallets/x y", false},
	} {
		if got := corePathIsWellFormed(tc.path); got != tc.ok {
			t.Errorf("corePathIsWellFormed(%q) = %v, want %v", tc.path, got, tc.ok)
		}
	}
}

func TestCorePath_RefusedBeforeAnyRequest(t *testing.T) {
	client, seen := coreRecorder(t, `{}`)
	var out map[string]any
	err := client.get(context.Background(), "/internal/v1/refunds/a?merchant_id=v&x=?merchant_id=m", &out)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound for a malformed path, got %v", err)
	}
	if n := len(seen()); n != 0 {
		t.Fatalf("a malformed path reached core (%d requests)", n)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }

// A2-14: a Sandbox transaction is labelled SANDBOX, not the "LIVE" every
// transaction used to carry.
func TestTransaction_CarriesTheSessionsEnvironment(t *testing.T) {
	client, _ := coreRecorder(t, `{"id":"t","merchant_id":"me","amount":{"amount_minor":1,"currency":"AOA"}}`)
	tx, err := NewCoreApiTransactionService(client).Get(context.Background(), "me", "t", "SANDBOX")
	if err != nil || tx.Environment != "SANDBOX" {
		t.Fatalf("a Sandbox transaction is labelled %q (err %v)", tx.Environment, err)
	}
}
