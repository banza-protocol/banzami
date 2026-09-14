package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type sbxSessions map[string]*service.PaymentSession

func (s sbxSessions) Get(_ context.Context, id string) (*service.PaymentSession, error) {
	if v, ok := s[id]; ok {
		return v, nil
	}
	return nil, errors.New("not found")
}

type sbxLinks map[string]*service.PaymentLink

func (l sbxLinks) Get(_ context.Context, id string) (*service.PaymentLink, error) {
	if v, ok := l[id]; ok {
		return v, nil
	}
	return nil, errors.New("not found")
}

type upstream struct {
	mu    sync.Mutex
	calls []string
	srv   *httptest.Server
}

func newUpstream(t *testing.T) *upstream {
	u := &upstream{}
	u.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		u.mu.Lock()
		u.calls = append(u.calls, r.Method+" "+r.URL.Path+"?"+r.URL.RawQuery+" "+string(b)+" key="+r.Header.Get("X-Internal-Key"))
		u.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/payments") {
			// The link path's view: link fields, the transfer as transaction_id, a receipt.
			_, _ = w.Write([]byte(`{"slug":"s","merchant_name":"Loja","status":"PAID","amount_minor":5000,"currency":"AOA","transaction_id":"tr-1","receipt":{"proof_reference":"BZM-1"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"PAID"}`))
	}))
	t.Cleanup(u.srv.Close)
	return u
}

func slug(s string) *string { return &s }

func sbxRouter(h *SandboxDevHandler, p *middleware.DeveloperPrincipal) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.ContextWithDeveloperPrincipal(req.Context(), p)))
		})
	})
	r.Get("/v1/sandbox/scenarios", h.Scenarios)
	r.Post("/v1/sandbox/test-payers", h.CreateTestPayer)
	r.Post("/v1/sandbox/test-payers/{id}/payments", h.PayAsTestPayer)
	return r
}

func principalA() *middleware.DeveloperPrincipal {
	return &middleware.DeveloperPrincipal{ProjectID: "proj-A", Environment: "SANDBOX", Bound: true, MerchantID: "merchant-A",
		Scopes: []string{"sandbox:read", "sandbox:write"}}
}

func post(t *testing.T, h http.Handler, path, body, key string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestSandboxDev_ProjectComesFromTheKeyNeverTheBody(t *testing.T) {
	up := newUpstream(t)
	h := NewSandboxDevHandler(up.srv.URL, "ik", sbxSessions{}, sbxLinks{})
	// A body naming a Project is refused outright: nothing reaches public-api.
	if rec := post(t, sbxRouter(h, principalA()), "/v1/sandbox/test-payers", `{"label":"x","project_id":"proj-B"}`, ""); rec.Code != http.StatusBadRequest || len(up.calls) != 0 {
		t.Fatalf("a body naming project_id: %d %s calls=%v", rec.Code, rec.Body, up.calls)
	}
	rec := post(t, sbxRouter(h, principalA()), "/v1/sandbox/test-payers", `{"label":"x"}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	if len(up.calls) != 1 || !strings.Contains(up.calls[0], "project_id=proj-A") || strings.Contains(up.calls[0], "?project_id=proj-B") || !strings.HasSuffix(up.calls[0], "key=ik") {
		t.Fatalf("upstream call: %v", up.calls)
	}
}

func TestSandboxDev_APayerPaysOnlyItsOwnProjectsResources(t *testing.T) {
	up := newUpstream(t)
	sessions := sbxSessions{
		"own":   {SessionID: "own", MerchantID: "merchant-A", PaymentLinkSlug: slug("s-own"), QrPayload: slug("qr-own")},
		"other": {SessionID: "other", MerchantID: "merchant-B", PaymentLinkSlug: slug("s-other")},
	}
	links := sbxLinks{"link-B": {ID: "link-B", MerchantID: "merchant-B", Slug: "l-b"}}
	h := NewSandboxDevHandler(up.srv.URL, "ik", sessions, links)
	r := sbxRouter(h, principalA())
	if rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"other"}`, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("another tenant's session: %d", rec.Code)
	}
	if rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_link_id":"link-B"}`, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("another tenant's link: %d", rec.Code)
	}
	if len(up.calls) != 0 {
		t.Fatalf("a cross-tenant payment reached the payment service: %v", up.calls)
	}
	if rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","via":"QR"}`, ""); rec.Code != http.StatusOK {
		t.Fatalf("own session by QR: %d %s", rec.Code, rec.Body)
	}
	if !strings.Contains(up.calls[0], `"qr_payload":"qr-own"`) {
		t.Fatalf("QR payload not forwarded: %v", up.calls)
	}
}

func TestSandboxDev_SimulatedOutcomesAreExplicitAndTimeoutIsRecoverable(t *testing.T) {
	up := newUpstream(t)
	sessions := sbxSessions{"own": {SessionID: "own", MerchantID: "merchant-A", PaymentLinkSlug: slug("s-own")}}
	h := NewSandboxDevHandler(up.srv.URL, "ik", sessions, sbxLinks{})
	r := sbxRouter(h, principalA())

	for _, c := range []struct {
		sim  string
		want int
		code string
	}{{"DECLINED", 402, "PAYMENT_DECLINED"}, {"PROVIDER_UNAVAILABLE", 503, "PROVIDER_UNAVAILABLE"}} {
		rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","simulate":"`+c.sim+`"}`, "")
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != c.want || body["code"] != c.code || body["simulated"] != true {
			t.Fatalf("%s: %d %s", c.sim, rec.Code, rec.Body)
		}
	}
	if len(up.calls) != 0 {
		t.Fatal("a declined or unavailable simulation moved money")
	}
	if rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","simulate":"TIMEOUT"}`, ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("TIMEOUT without a key: %d", rec.Code)
	}
	rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","simulate":"TIMEOUT"}`, "idem-1")
	if rec.Code != http.StatusGatewayTimeout || !strings.Contains(rec.Body.String(), "SANDBOX_SIMULATED_TIMEOUT") || len(up.calls) != 1 {
		t.Fatalf("TIMEOUT must pay and answer 504: %d %s calls=%d", rec.Code, rec.Body, len(up.calls))
	}
	retry := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own"}`, "idem-1")
	if retry.Code != http.StatusOK || !strings.Contains(retry.Body.String(), "PAID") || len(up.calls) != 1 {
		t.Fatalf("the retry must read the real result without paying again: %d %s calls=%d", retry.Code, retry.Body, len(up.calls))
	}
	// An SDK retries a 504 with the SAME body and key: that too reads the real
	// result, never a second payment.
	again := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","simulate":"TIMEOUT"}`, "idem-1")
	if again.Code != http.StatusOK || len(up.calls) != 1 {
		t.Fatalf("an identical retry must read the real result: %d %s calls=%d", again.Code, again.Body, len(up.calls))
	}
	var result map[string]any
	_ = json.Unmarshal(again.Body.Bytes(), &result)
	if result["transfer_id"] != "tr-1" || result["proof_reference"] != "BZM-1" || result["via"] != "LINK" ||
		result["payment_session_id"] != "own" || result["merchant_name"] != nil || result["slug"] != nil {
		t.Fatalf("a test payment has one shape, without the payee's link view: %s", again.Body)
	}
	if rec := post(t, r, "/v1/sandbox/test-payers/p1/payments", `{"payment_session_id":"own","simulate":"MAGIC"}`, ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("an unknown simulate value: %d", rec.Code)
	}
}

func TestSandboxDev_ScopeAndEnvironment(t *testing.T) {
	h := NewSandboxDevHandler("http://unused", "ik", sbxSessions{}, sbxLinks{})
	noScope := principalA()
	noScope.Scopes = []string{"payment_sessions:write"}
	if rec := post(t, sbxRouter(h, noScope), "/v1/sandbox/test-payers", `{}`, ""); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "INSUFFICIENT_SCOPE") {
		t.Fatalf("missing scope: %d %s", rec.Code, rec.Body)
	}
	live := principalA()
	live.Environment = "LIVE"
	if rec := post(t, sbxRouter(h, live), "/v1/sandbox/test-payers", `{}`, ""); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "SANDBOX_ONLY") {
		t.Fatalf("LIVE principal: %d %s", rec.Code, rec.Body)
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/sandbox/scenarios", nil)
	rec := httptest.NewRecorder()
	sbxRouter(h, principalA()).ServeHTTP(rec, req)
	var cat struct {
		Scenarios []struct {
			ID        string `json:"id"`
			Simulated bool   `json:"simulated"`
		} `json:"scenarios"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &cat) != nil || len(cat.Scenarios) < 20 {
		t.Fatalf("scenario catalogue: %d", rec.Code)
	}
}
