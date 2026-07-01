package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakePaymentSessions struct {
	merchantID string
	withQR     bool
}

func (f *fakePaymentSessions) Create(ctx context.Context, in service.CreatePaymentSessionInput) (*service.PaymentSession, error) {
	slug := "abc123"
	var qr *string
	if f.withQR {
		p := "BANZA-SBX:eyJ0IjoiRCJ9"
		qr = &p
	}
	return &service.PaymentSession{
		SessionID: "sess-1", MerchantID: in.MerchantID, WalletAccountID: in.WalletAccountID,
		Currency: "AOA", Status: "ACTIVE", PaymentLinkSlug: &slug, QrPayload: qr, CreatedAt: "2026-06-30T00:00:00Z",
	}, nil
}
func (f *fakePaymentSessions) GetByInterface(ctx context.Context, kind, refID string) (*service.PaymentSession, error) {
	return f.Get(ctx, refID)
}

func (f *fakePaymentSessions) List(ctx context.Context, merchantID, status string, limit int) ([]service.PaymentSession, error) {
	s, err := f.Get(ctx, "sess-1")
	if err != nil {
		return nil, err
	}
	return []service.PaymentSession{*s}, nil
}

func (f *fakePaymentSessions) Get(ctx context.Context, id string) (*service.PaymentSession, error) {
	slug := "abc123"
	var qr *string
	if f.withQR {
		p := "BANZA-SBX:eyJ0IjoiRCJ9"
		qr = &p
	}
	return &service.PaymentSession{
		SessionID: id, MerchantID: f.merchantID, WalletAccountID: "wa-1",
		Currency: "AOA", Status: "ACTIVE", PaymentLinkSlug: &slug, QrPayload: qr, CreatedAt: "2026-06-30T00:00:00Z",
	}, nil
}

func psHandler(merchant string, withQR bool) *PaymentSessionHandler {
	return NewPaymentSessionHandler(&fakePaymentSessions{merchantID: merchant, withQR: withQR}, activeMerchant())
}

func reqWith(method, target, body, merchant string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	if merchant != "" {
		req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: merchant, Environment: "SANDBOX"}))
	}
	return req
}

func TestPaymentSession_CreateReturnsInterfaces(t *testing.T) {
	h := psHandler("doa-merchant", true)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/business/payment-sessions", `{"wallet_account_id":"wa-1","purpose":"DONATION","amount_minor":50000}`, "doa-merchant"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{"payment_link", "dynamic_qr", "deep_link", "wa-1", "/public/pay/abc123"} {
		if !strings.Contains(body, want) {
			t.Fatalf("response missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "account_id\":\"led") || strings.Contains(body, "ledger") {
		t.Fatalf("must not leak ledger ids: %s", body)
	}
}

func TestPaymentSession_Unauthenticated(t *testing.T) {
	h := psHandler("doa-merchant", true)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/business/payment-sessions", `{"wallet_account_id":"wa-1"}`, ""))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestPaymentSession_InactiveMerchant(t *testing.T) {
	suspended := &fakeMerchants{rec: &service.MerchantRecord{ID: "doa-merchant", Status: service.MerchantStatusSuspended}}
	h := NewPaymentSessionHandler(&fakePaymentSessions{merchantID: "doa-merchant", withQR: true}, suspended)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/business/payment-sessions", `{"wallet_account_id":"wa-1"}`, "doa-merchant"))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("suspended merchant must be 403, got %d", rec.Code)
	}
}

// QR rendering (U4): png/svg are real images; pdf is a clean 415.
func TestPaymentSession_QrRender(t *testing.T) {
	cases := []struct {
		format, ctype string
		code          int
	}{
		{"png", "image/png", 200},
		{"svg", "image/svg+xml", 200},
		{"pdf", "", 415},
	}
	for _, c := range cases {
		h := psHandler("doa-merchant", true)
		r := chi.NewRouter()
		r.Get("/v1/business/payment-sessions/{id}/qr", h.Qr)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, reqWith("GET", "https://x/v1/business/payment-sessions/sess-1/qr?format="+c.format, "", "doa-merchant"))
		if rec.Code != c.code {
			t.Fatalf("format %s: want %d, got %d (%s)", c.format, c.code, rec.Code, rec.Body.String())
		}
		if c.ctype != "" && !strings.HasPrefix(rec.Header().Get("Content-Type"), c.ctype) {
			t.Fatalf("format %s: want content-type %s, got %s", c.format, c.ctype, rec.Header().Get("Content-Type"))
		}
		if c.format == "png" && rec.Body.Len() < 100 {
			t.Fatalf("png too small to be real: %d bytes", rec.Body.Len())
		}
		if c.format == "svg" && !strings.Contains(rec.Body.String(), "<svg") {
			t.Fatalf("svg not rendered: %s", rec.Body.String()[:min(80, rec.Body.Len())])
		}
	}
}
