package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// --- fakes -------------------------------------------------------------------

type fakeReceivePointSvc struct {
	ensure       *service.ReceivePoint
	ensureErr    error
	pub          *service.ReceivePointPublic
	resolveErr   error
	mintSession  *service.PaymentSession
	mintErr      error
	disableErr   error
	lastPayer    string
	lastSlug     string
	lastKey      string
	lastAmount   int64
	disableCalls int
}

func (f *fakeReceivePointSvc) EnsureActive(_ context.Context, _, _ string) (*service.ReceivePoint, error) {
	return f.ensure, f.ensureErr
}
func (f *fakeReceivePointSvc) ResolveForPayment(_ context.Context, slug string) (*service.ReceivePointPublic, string, error) {
	f.lastSlug = slug
	// The merchant id is deliberately returned to the handler and MUST NOT be
	// forwarded to the client — a real internal id here proves that.
	return f.pub, "merchant-internal-id-0001", f.resolveErr
}
func (f *fakeReceivePointSvc) MintSession(_ context.Context, _ service.PaymentSessionService, payerID, slug, key string, amount int64) (*service.PaymentSession, error) {
	f.lastPayer, f.lastSlug, f.lastKey, f.lastAmount = payerID, slug, key, amount
	return f.mintSession, f.mintErr
}
func (f *fakeReceivePointSvc) Disable(_ context.Context, _, _ string) error {
	f.disableCalls++
	return f.disableErr
}

// fakeMerchants and activeMerchant are shared internal handler-test helpers
// (receipts_test.go / wallet_accounts_test.go).

func withMerchantPrincipal(r *http.Request, merchantID string) *http.Request {
	return r.WithContext(middleware.ContextWithPrincipal(r.Context(), &middleware.Principal{MerchantID: merchantID}))
}

func withSlug(r *http.Request, slug string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func newHandler(svc receivePointService, m merchantLookup) *BusinessReceivePointHandler {
	return NewBusinessReceivePointHandler(svc, nil, m, "SANDBOX", "https://pay.banzami.com")
}

// --- owner surface -----------------------------------------------------------

func TestReceivePointHandler_MineReturnsPrintableArtifact(t *testing.T) {
	svc := &fakeReceivePointSvc{ensure: &service.ReceivePoint{PublicSlug: "SLUG123abcSLUG123abcAA", Status: "ACTIVE", Environment: "SANDBOX"}}
	h := newHandler(svc, activeMerchant())

	w := httptest.NewRecorder()
	r := withMerchantPrincipal(httptest.NewRequest(http.MethodGet, "/v1/business/receive-point", nil), "m1")
	h.Mine(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body)
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["slug"] != "SLUG123abcSLUG123abcAA" {
		t.Fatalf("slug missing: %v", body)
	}
	if body["deep_link"] != "banzami://pay/business/SLUG123abcSLUG123abcAA" {
		t.Fatalf("deep_link wrong: %v", body["deep_link"])
	}
	if body["pay_url"] != "https://pay.banzami.com/b/SLUG123abcSLUG123abcAA" {
		t.Fatalf("pay_url wrong: %v", body["pay_url"])
	}
}

func TestReceivePointHandler_MineRequiresAuth(t *testing.T) {
	h := newHandler(&fakeReceivePointSvc{}, activeMerchant())
	w := httptest.NewRecorder()
	h.Mine(w, httptest.NewRequest(http.MethodGet, "/v1/business/receive-point", nil)) // no principal
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 without a principal, got %d", w.Code)
	}
}

func TestReceivePointHandler_MineRejectsInactiveBusiness(t *testing.T) {
	m := &fakeMerchants{rec: &service.MerchantRecord{ID: "m1", Status: service.MerchantStatusSuspended}}
	h := newHandler(&fakeReceivePointSvc{}, m)
	w := httptest.NewRecorder()
	h.Mine(w, withMerchantPrincipal(httptest.NewRequest(http.MethodGet, "/v1/business/receive-point", nil), "m1"))
	if w.Code != http.StatusForbidden {
		t.Fatalf("want 403 for a non-active business, got %d", w.Code)
	}
}

func TestReceivePointHandler_Disable(t *testing.T) {
	svc := &fakeReceivePointSvc{}
	h := newHandler(svc, activeMerchant())
	w := httptest.NewRecorder()
	h.Disable(w, withMerchantPrincipal(httptest.NewRequest(http.MethodPost, "/v1/business/receive-point/disable", nil), "m1"))
	if w.Code != http.StatusOK || svc.disableCalls != 1 {
		t.Fatalf("disable: code=%d calls=%d", w.Code, svc.disableCalls)
	}
}

// --- public resolve ----------------------------------------------------------

func TestReceivePointHandler_ResolveIsPayerSafe(t *testing.T) {
	svc := &fakeReceivePointSvc{pub: &service.ReceivePointPublic{
		Slug: "sl", DisplayName: "Loja Teste", Handle: "loja", Currency: "AOA", Status: "ACTIVE", Environment: "SANDBOX",
	}}
	h := newHandler(svc, activeMerchant())

	w := httptest.NewRecorder()
	h.Resolve(w, withSlug(httptest.NewRequest(http.MethodGet, "/v1/receive-points/sl", nil), "sl"))
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	raw := w.Body.String()
	if !strings.Contains(raw, "Loja Teste") || !strings.Contains(raw, "AOA") {
		t.Fatalf("public identity missing: %s", raw)
	}
	// The internal merchant id the service returned must NEVER reach the client.
	if strings.Contains(raw, "merchant-internal-id-0001") || strings.Contains(raw, "merchant_id") {
		t.Fatalf("resolve leaked an internal id: %s", raw)
	}
}

func TestReceivePointHandler_ResolveErrorContract(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{service.ErrReceivePointNotFound, http.StatusNotFound},
		{service.ErrReceivePointDisabled, http.StatusConflict},
		{service.ErrReceivePointIneligible, http.StatusUnprocessableEntity},
	}
	for _, c := range cases {
		svc := &fakeReceivePointSvc{resolveErr: c.err}
		h := newHandler(svc, activeMerchant())
		w := httptest.NewRecorder()
		h.Resolve(w, withSlug(httptest.NewRequest(http.MethodGet, "/v1/receive-points/sl", nil), "sl"))
		if w.Code != c.want {
			t.Fatalf("resolve %v: want %d, got %d", c.err, c.want, w.Code)
		}
	}
}

// --- internal mint -----------------------------------------------------------

func mintReq(payer string, amount *int64, key string) *http.Request {
	b := map[string]any{"payer_id": payer, "idempotency_key": key}
	if amount != nil {
		b["amount_minor"] = *amount
	}
	raw, _ := json.Marshal(b)
	return withSlug(httptest.NewRequest(http.MethodPost, "/internal/v1/receive-points/sl/sessions", strings.NewReader(string(raw))), "sl")
}

func TestReceivePointHandler_MintSuccess(t *testing.T) {
	slug := "linkSlug01"
	amt := int64(2500)
	svc := &fakeReceivePointSvc{mintSession: &service.PaymentSession{SessionID: "sess-1", Currency: "AOA", AmountMinor: &amt, Status: "CREATED", PaymentLinkSlug: &slug}}
	h := newHandler(svc, activeMerchant())

	w := httptest.NewRecorder()
	h.Mint(w, mintReq("payer-1", &amt, "key-1"))
	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, w.Body)
	}
	if svc.lastPayer != "payer-1" || svc.lastSlug != "sl" || svc.lastKey != "key-1" || svc.lastAmount != 2500 {
		t.Fatalf("mint args not threaded: %+v", svc)
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["session_id"] != "sess-1" || body["pay_url"] != "https://pay.banzami.com/pay/linkSlug01" {
		t.Fatalf("session DTO wrong: %v", body)
	}
}

func TestReceivePointHandler_MintValidation(t *testing.T) {
	amt := int64(1000)
	zero := int64(0)
	h := newHandler(&fakeReceivePointSvc{}, activeMerchant())

	// Missing payer.
	w := httptest.NewRecorder()
	h.Mint(w, mintReq("", &amt, "k"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing payer: want 400, got %d", w.Code)
	}
	// Non-positive amount.
	w = httptest.NewRecorder()
	h.Mint(w, mintReq("p", &zero, "k"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("zero amount: want 400, got %d", w.Code)
	}
	// Absent amount.
	w = httptest.NewRecorder()
	h.Mint(w, mintReq("p", nil, "k"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("absent amount: want 400, got %d", w.Code)
	}
}

func TestReceivePointHandler_MintErrorContract(t *testing.T) {
	amt := int64(1000)
	cases := []struct {
		err       error
		want      int
		wantRetry bool
	}{
		{service.ErrMintKeyRequired, http.StatusBadRequest, false},
		{service.ErrMintKeyTooLong, http.StatusBadRequest, false},
		{service.ErrIdempotencyConflict, http.StatusConflict, false},
		{service.ErrMintPending, http.StatusConflict, true},
		{service.ErrReceivePointIneligible, http.StatusUnprocessableEntity, false},
		{service.ErrReceivePointDisabled, http.StatusConflict, false},
	}
	for _, c := range cases {
		svc := &fakeReceivePointSvc{mintErr: c.err}
		h := newHandler(svc, activeMerchant())
		w := httptest.NewRecorder()
		h.Mint(w, mintReq("p", &amt, "k"))
		if w.Code != c.want {
			t.Fatalf("mint %v: want %d, got %d", c.err, c.want, w.Code)
		}
		if c.wantRetry && w.Header().Get("Retry-After") == "" {
			t.Fatalf("mint %v: expected Retry-After", c.err)
		}
	}
}
