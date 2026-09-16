package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

type fakeReceivePointGW struct {
	resolved   *service.ReceivePointResolved
	resolveErr error
	minted     *service.MintedSession
	mintErr    error
	lastPayer  string
	lastSlug   string
	lastAmount int64
	lastKey    string
}

func (f *fakeReceivePointGW) Resolve(_ context.Context, slug string) (*service.ReceivePointResolved, error) {
	f.lastSlug = slug
	return f.resolved, f.resolveErr
}
func (f *fakeReceivePointGW) Mint(_ context.Context, slug, payer string, amount int64, key string) (*service.MintedSession, error) {
	f.lastSlug, f.lastPayer, f.lastAmount, f.lastKey = slug, payer, amount, key
	return f.minted, f.mintErr
}

func rpReq(method, slug, body string, consumerID string) *http.Request {
	r := httptest.NewRequest(method, "/v1/receive-points/"+slug, strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	if consumerID != "" {
		ctx = middleware.InjectConsumer(ctx, &middleware.Consumer{ID: consumerID})
	}
	return r.WithContext(ctx)
}

func TestReceivePointPublicAPI_ResolveIsPublicAndPayerSafe(t *testing.T) {
	gw := &fakeReceivePointGW{resolved: &service.ReceivePointResolved{
		Slug: "sl", DisplayName: "Loja Teste", Handle: "loja", Currency: "AOA", Status: "ACTIVE",
	}}
	h := newReceivePointHandlerWithFake(gw)

	w := httptest.NewRecorder()
	h.Resolve(w, rpReq(http.MethodGet, "sl", "", "")) // no consumer — public
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Loja Teste") {
		t.Fatalf("identity missing: %s", w.Body.String())
	}
}

func TestReceivePointPublicAPI_ResolveErrorContract(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{service.ErrReceivePointNotFound, http.StatusNotFound},
		{service.ErrReceivePointDisabled, http.StatusConflict},
		{service.ErrReceivePointIneligible, http.StatusUnprocessableEntity},
		{service.ErrReceivePointUnavailable, http.StatusBadGateway},
	}
	for _, c := range cases {
		gw := &fakeReceivePointGW{resolveErr: c.err}
		h := newReceivePointHandlerWithFake(gw)
		w := httptest.NewRecorder()
		h.Resolve(w, rpReq(http.MethodGet, "sl", "", ""))
		if w.Code != c.want {
			t.Fatalf("resolve %v: want %d, got %d", c.err, c.want, w.Code)
		}
	}
}

func TestReceivePointPublicAPI_PayTakesPayerFromSession(t *testing.T) {
	amt := int64(1500)
	gw := &fakeReceivePointGW{minted: &service.MintedSession{SessionID: "sess-9", Currency: "AOA", AmountMinor: &amt, Status: "CREATED", PayURL: "https://pay.banzami.com/pay/x"}}
	h := newReceivePointHandlerWithFake(gw)

	// The body tries to smuggle a payer_id; it must be ignored — the payer is the
	// session's consumer.
	w := httptest.NewRecorder()
	h.Pay(w, rpReq(http.MethodPost, "sl", `{"amount_minor":1500,"idempotency_key":"k1","payer_id":"attacker"}`, "consumer-7"))
	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, w.Body)
	}
	if gw.lastPayer != "consumer-7" {
		t.Fatalf("payer must come from the session, got %q", gw.lastPayer)
	}
	if gw.lastAmount != 1500 || gw.lastKey != "k1" || gw.lastSlug != "sl" {
		t.Fatalf("mint args not threaded: %+v", gw)
	}
}

func TestReceivePointPublicAPI_PayRequiresAuth(t *testing.T) {
	h := newReceivePointHandlerWithFake(&fakeReceivePointGW{})
	w := httptest.NewRecorder()
	h.Pay(w, rpReq(http.MethodPost, "sl", `{"amount_minor":100}`, "")) // no consumer
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", w.Code)
	}
}

func TestReceivePointPublicAPI_PayRejectsBadAmount(t *testing.T) {
	h := newReceivePointHandlerWithFake(&fakeReceivePointGW{})
	for _, body := range []string{`{"amount_minor":0}`, `{}`, `{"amount_minor":-5}`} {
		w := httptest.NewRecorder()
		h.Pay(w, rpReq(http.MethodPost, "sl", body, "c1"))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s: want 400, got %d", body, w.Code)
		}
	}
}

func TestReceivePointPublicAPI_PayDefaultsIdempotencyKey(t *testing.T) {
	gw := &fakeReceivePointGW{minted: &service.MintedSession{SessionID: "s"}}
	h := newReceivePointHandlerWithFake(gw)
	w := httptest.NewRecorder()
	h.Pay(w, rpReq(http.MethodPost, "sl", `{"amount_minor":100}`, "c1"))
	if w.Code != http.StatusCreated || gw.lastKey == "" {
		t.Fatalf("a missing key must be defaulted: code=%d key=%q", w.Code, gw.lastKey)
	}
}

func TestReceivePointPublicAPI_PayErrorContract(t *testing.T) {
	cases := []struct {
		err       error
		want      int
		wantRetry bool
	}{
		{service.ErrReceivePointConflict, http.StatusConflict, false},
		{service.ErrReceivePointPending, http.StatusConflict, true},
		{service.ErrReceivePointIneligible, http.StatusUnprocessableEntity, false},
		{service.ErrReceivePointMintKey, http.StatusBadRequest, false},
		{service.ErrReceivePointDisabled, http.StatusConflict, false},
		{service.ErrReceivePointUnavailable, http.StatusBadGateway, false},
	}
	for _, c := range cases {
		gw := &fakeReceivePointGW{mintErr: c.err}
		h := newReceivePointHandlerWithFake(gw)
		w := httptest.NewRecorder()
		h.Pay(w, rpReq(http.MethodPost, "sl", `{"amount_minor":100,"idempotency_key":"k"}`, "c1"))
		if w.Code != c.want {
			t.Fatalf("pay %v: want %d, got %d", c.err, c.want, w.Code)
		}
		if c.wantRetry && w.Header().Get("Retry-After") == "" {
			t.Fatalf("pay %v: expected Retry-After", c.err)
		}
	}
}
