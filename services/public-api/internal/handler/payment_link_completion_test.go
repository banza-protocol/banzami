package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
)

// A2-06. The transfer is committed before the link's payment is completed.
// When the completion fails, the payer is told the truth — taken, not yet
// confirmed, retry — and the completion is ONE call to core (which claims the
// link, records the payment and pays the session together); the session is no
// longer settled by a separate call whose failure nobody saw.
func TestPayLink_AFailedCompletionAsksForARetryAndIsOneCall(t *testing.T) {
	var mu sync.Mutex
	var paths []string
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		paths = append(paths, r.Method+" "+r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/internal/v1/payment-links/by-slug/"):
			_, _ = w.Write([]byte(`{"id":"11111111-1111-4111-8111-111111111111","slug":"abcdef012345","merchant_id":"m","wallet_id":"w","amount_minor":2000,"currency":"AOA","status":"ACTIVE"}`))
		case r.URL.Path == "/internal/v1/consumer-wallets":
			_, _ = w.Write([]byte(`{"id":"cw","consumer_id":"c1","currency":"AOA","status":"ACTIVE"}`))
		case r.URL.Path == "/internal/v1/transfers":
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"22222222-2222-4222-8222-222222222222","status":"COMPLETED","amount_minor":2000,"currency":"AOA"}`))
		case strings.HasSuffix(r.URL.Path, "/mark-used"):
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":{"code":"INTERNAL","message":"outbox unavailable"}}`))
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer core.Close()

	h := NewPaymentLinkHandler(service.NewCorePublicClient(core.URL), nil, nil, "SANDBOX")
	req := httptest.NewRequest(http.MethodPost, "/v1/payment-links/abcdef012345/pay", strings.NewReader(`{}`))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", "abcdef012345")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = middleware.InjectConsumer(ctx, &middleware.Consumer{ID: "c1"})
	w := httptest.NewRecorder()
	h.Pay(w, req.WithContext(ctx))

	if w.Code != http.StatusBadGateway {
		t.Fatalf("a failed completion answered %d, want 502: %s", w.Code, w.Body.String())
	}
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Code != "PAYMENT_NOT_CONFIRMED" {
		t.Fatalf("code %q, want PAYMENT_NOT_CONFIRMED", body.Code)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, p := range paths {
		if strings.Contains(p, "settle-by-interface") {
			t.Fatalf("the session was settled outside the completion: %s", p)
		}
	}
}
