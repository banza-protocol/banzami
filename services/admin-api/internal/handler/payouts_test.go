package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// The console asks for a "Motivo da devolução" before marking a payout
// RETURNED. The reason must be required and must reach the audit row — Core's
// transition takes none, so the audit trail is the only place it can live.
func TestPayoutReturned_RequiresAndAuditsTheReason(t *testing.T) {
	coreCalls := 0
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		coreCalls++
		_, _ = w.Write([]byte(`{"id":"p1","status":"RETURNED"}`))
	}))
	defer core.Close()
	h := NewPayoutHandler(service.NewCoreAdminClient(core.URL))

	send := func(body string) (*httptest.ResponseRecorder, *annSink) {
		sink := &annSink{}
		w := httptest.NewRecorder()
		auditedRoute(sink, http.MethodPost, "/admin/v1/payouts/{id}/returned", h.MarkReturned).
			ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/payouts/p1/returned", strings.NewReader(body)))
		return w, sink
	}

	for _, body := range []string{``, `{}`, `{"reason":""}`, `{"reason":"   "}`} {
		if w, _ := send(body); w.Code != http.StatusBadRequest {
			t.Errorf("body %q: got %d, want 400", body, w.Code)
		}
	}
	if coreCalls != 0 {
		t.Fatalf("a return without a reason reached Core %d time(s)", coreCalls)
	}

	w, sink := send(`{"reason":"  Conta inexistente no banco  "}`)
	if w.Code != http.StatusOK {
		t.Fatalf("returned with a reason: %d %s", w.Code, w.Body.String())
	}
	if coreCalls != 1 {
		t.Fatalf("Core calls = %d, want 1", coreCalls)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("want one audit row, got %d", len(sink.entries))
	}
	after, _ := sink.entries[0].After.(map[string]any)
	if after["reason"] != "Conta inexistente no banco" || after["status"] != "RETURNED" {
		t.Fatalf("audit after = %v, want the trimmed reason and RETURNED", sink.entries[0].After)
	}
}

func TestPayoutFail_BlankReasonRefused(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("a blank reason must not reach Core")
	}))
	defer core.Close()
	h := NewPayoutHandler(service.NewCoreAdminClient(core.URL))
	w := httptest.NewRecorder()
	auditedRoute(&annSink{}, http.MethodPost, "/admin/v1/payouts/{id}/fail", h.Fail).
		ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/payouts/p1/fail", strings.NewReader(`{"reason":"  "}`)))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", w.Code)
	}
}
