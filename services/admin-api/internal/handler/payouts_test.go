package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/admin-api/internal/service"
)

// The console asks for a "Motivo da devolução" before marking a payout
// RETURNED. The reason must be required and must reach the audit row; the
// provider's return reference is required too and reaches Core, which records it
// (MONEY-MODEL-001: a return restores the participant only on the rail's word).
func TestPayoutReturned_RequiresAndAuditsTheReason(t *testing.T) {
	coreCalls := 0
	var coreBody string
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		coreCalls++
		b, _ := io.ReadAll(r.Body)
		coreBody = string(b)
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

	for _, body := range []string{``, `{}`, `{"reason":""}`, `{"reason":"   "}`,
		`{"reason":"Conta inexistente"}`, `{"reason":"Conta inexistente","evidence_ref":"  "}`} {
		if w, _ := send(body); w.Code != http.StatusBadRequest {
			t.Errorf("body %q: got %d, want 400", body, w.Code)
		}
	}
	if coreCalls != 0 {
		t.Fatalf("a return without a reason reached Core %d time(s)", coreCalls)
	}

	w, sink := send(`{"reason":"  Conta inexistente no banco  ","evidence_ref":" EMIS-RET-0042 "}`)
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
	if after["reason"] != "Conta inexistente no banco" || after["status"] != "RETURNED" || after["evidence_ref"] != "EMIS-RET-0042" {
		t.Fatalf("audit after = %v, want the trimmed reason, the evidence and RETURNED", sink.entries[0].After)
	}
	if !strings.Contains(coreBody, `"evidence_ref":"EMIS-RET-0042"`) {
		t.Fatalf("Core body = %s, want the trimmed evidence_ref", coreBody)
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

// A SENT payout is failed only on the provider's evidence. Core decides; its
// refusal reaches the operator as it is, and the evidence is passed through.
func TestPayoutFail_PassesEvidenceAndCoreRefusal(t *testing.T) {
	var coreBody string
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		coreBody = string(b)
		if !strings.Contains(coreBody, "evidence_ref") {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = w.Write([]byte(`{"error":{"code":"EXTERNAL_EVIDENCE_REQUIRED","message":"x"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"p1","status":"FAILED"}`))
	}))
	defer core.Close()
	h := NewPayoutHandler(service.NewCoreAdminClient(core.URL))
	send := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		auditedRoute(&annSink{}, http.MethodPost, "/admin/v1/payouts/{id}/fail", h.Fail).
			ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/admin/v1/payouts/p1/fail", strings.NewReader(body)))
		return w
	}
	if w := send(`{"reason":"provider timeout"}`); w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), "EXTERNAL_EVIDENCE_REQUIRED") {
		t.Fatalf("without evidence: %d %s, want Core's 422 EXTERNAL_EVIDENCE_REQUIRED", w.Code, w.Body.String())
	}
	if w := send(`{"reason":"rejected","evidence_ref":" EMIS-REJ-7 "}`); w.Code != http.StatusOK {
		t.Fatalf("with evidence: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(coreBody, `"evidence_ref":"EMIS-REJ-7"`) {
		t.Fatalf("Core body = %s", coreBody)
	}
}
