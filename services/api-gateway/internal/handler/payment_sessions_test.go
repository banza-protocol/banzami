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

type fakePaymentSessions struct {
	merchantID   string
	withQR       bool
	refundSource *service.RefundSource
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
		RefundSource: f.refundSource,
	}, nil
}

func psHandler(merchant string, withQR bool) *PaymentSessionHandler {
	return NewPaymentSessionHandler(&fakePaymentSessions{merchantID: merchant, withQR: withQR}, activeMerchant(), nil)
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
	h.Create(rec, reqWith("POST", "https://x/v1/payment-sessions", `{"wallet_account_id":"wa-1","purpose":"DONATION","amount_minor":50000}`, "doa-merchant"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	// Canonical response (BANZA ADR-015): one financial object exposed as a typed
	// `interfaces` ARRAY of {type, value, format} — PAYMENT_LINK, DEEP_LINK,
	// DYNAMIC_QR — never a flat payment_link/dynamic_qr/deep_link field. This is
	// the contract the SDK (PaymentSessionInterface[]) and DOA (via
	// paymentSessionInterface) actually consume.
	var resp struct {
		WalletAccountID string `json:"wallet_account_id"`
		Interfaces      []struct {
			Type   string `json:"type"`
			Value  string `json:"value"`
			Format string `json:"format"`
			QrURL  string `json:"qr_url"`
		} `json:"interfaces"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not the canonical payment-session DTO: %v (%s)", err, rec.Body.String())
	}
	if resp.WalletAccountID != "wa-1" {
		t.Fatalf("wallet_account_id = %q, want wa-1", resp.WalletAccountID)
	}
	byType := map[string]string{}
	for _, i := range resp.Interfaces {
		byType[i.Type] = i.Value
	}
	// The three payment interfaces are present, typed, and carry real values.
	if got := byType["PAYMENT_LINK"]; got != "https://x/public/pay/abc123" {
		t.Fatalf("PAYMENT_LINK interface value = %q, want the public pay URL", got)
	}
	if got := byType["DEEP_LINK"]; got != "banzami://pay/abc123" {
		t.Fatalf("DEEP_LINK interface value = %q, want banzami://pay/abc123", got)
	}
	if _, ok := byType["DYNAMIC_QR"]; !ok {
		t.Fatalf("missing DYNAMIC_QR interface: %s", rec.Body.String())
	}

	// The obsolete flat fields must NOT reappear, and no ledger id may leak.
	body := rec.Body.String()
	for _, forbidden := range []string{`"payment_link"`, `"dynamic_qr"`, `"deep_link"`, "ledger", `account_id":"led`} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("response must not contain %q (canonical contract is interfaces[]): %s", forbidden, body)
		}
	}
}

// Merchant-safe refundable-source discovery: a settled session exposes the
// PUBLIC typed source to its owner; an unsettled one omits the field entirely;
// the internal TRANSACTION token never appears.
func TestPaymentSession_RefundSourceExposedWhenPaid(t *testing.T) {
	fake := &fakePaymentSessions{
		merchantID:   "doa-merchant",
		withQR:       true,
		refundSource: &service.RefundSource{SourceType: "WALLET_PAYMENT", SourceID: "wp-77"},
	}
	h := NewPaymentSessionHandler(fake, activeMerchant(), nil)
	r := chi.NewRouter()
	r.Get("/v1/payment-sessions/{id}", h.Get)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, reqWith("GET", "https://x/v1/payment-sessions/sess-1", "", "doa-merchant"))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var resp struct {
		RefundSource *struct {
			SourceType string `json:"source_type"`
			SourceID   string `json:"source_id"`
		} `json:"refund_source"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad DTO: %v (%s)", err, rec.Body.String())
	}
	if resp.RefundSource == nil {
		t.Fatalf("settled session must expose refund_source: %s", rec.Body.String())
	}
	if resp.RefundSource.SourceType != "WALLET_PAYMENT" || resp.RefundSource.SourceID != "wp-77" {
		t.Fatalf("refund_source = %+v, want WALLET_PAYMENT/wp-77", resp.RefundSource)
	}
	if strings.Contains(rec.Body.String(), "TRANSACTION") {
		t.Fatalf("refund_source must never expose the internal TRANSACTION token: %s", rec.Body.String())
	}
}

func TestPaymentSession_RefundSourceOmittedWhenUnpaid(t *testing.T) {
	h := NewPaymentSessionHandler(&fakePaymentSessions{merchantID: "doa-merchant", withQR: true}, activeMerchant(), nil)
	r := chi.NewRouter()
	r.Get("/v1/payment-sessions/{id}", h.Get)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, reqWith("GET", "https://x/v1/payment-sessions/sess-1", "", "doa-merchant"))
	if strings.Contains(rec.Body.String(), "refund_source") {
		t.Fatalf("unsettled session must omit refund_source entirely: %s", rec.Body.String())
	}
}

func TestPaymentSession_Unauthenticated(t *testing.T) {
	h := psHandler("doa-merchant", true)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/payment-sessions", `{"wallet_account_id":"wa-1"}`, ""))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestPaymentSession_InactiveMerchant(t *testing.T) {
	suspended := &fakeMerchants{rec: &service.MerchantRecord{ID: "doa-merchant", Status: service.MerchantStatusSuspended}}
	h := NewPaymentSessionHandler(&fakePaymentSessions{merchantID: "doa-merchant", withQR: true}, suspended, nil)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/payment-sessions", `{"wallet_account_id":"wa-1"}`, "doa-merchant"))
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
		r.Get("/v1/payment-sessions/{id}/qr", h.Qr)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, reqWith("GET", "https://x/v1/payment-sessions/sess-1/qr?format="+c.format, "", "doa-merchant"))
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

// The link an integration hands to a person must open a payment page.
//
// PAYMENT_LINK used to be built from the request host: https://<api>/public/pay/{slug}.
// That route exists and answers 200 — with JSON, because it is what the payer app
// reads. So the single field in the API response named PAYMENT_LINK, the one an
// integration puts in a message to a customer, opened a JSON document. The payer
// surface is a different origin (pay.banzami.com, ADR-052) that the gateway cannot
// derive, so it is configuration.
func TestPaymentSession_PaymentLinkPointsAtTheHostedPayerSurface(t *testing.T) {
	h := psHandler("doa-merchant", true).WithPayBaseURL("https://pay.banzami.com")
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://sandbox-api.banzami.com/v1/payment-sessions",
		`{"wallet_account_id":"wa-1","purpose":"DONATION","amount_minor":50000}`, "doa-merchant"))
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", rec.Code, rec.Body.String())
	}

	var resp struct {
		Interfaces []struct {
			Type  string `json:"type"`
			Value string `json:"value"`
		} `json:"interfaces"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad DTO: %v", err)
	}
	byType := map[string]string{}
	for _, i := range resp.Interfaces {
		byType[i.Type] = i.Value
	}
	if got := byType["PAYMENT_LINK"]; got != "https://pay.banzami.com/pay/abc123" {
		t.Fatalf("PAYMENT_LINK = %q, want the hosted payer surface", got)
	}
	// The API origin must not appear in a value meant for a human. This is the
	// specific regression: the host is right there on the request.
	if strings.Contains(byType["PAYMENT_LINK"], "sandbox-api.banzami.com") {
		t.Fatalf("PAYMENT_LINK still points at the API: %q", byType["PAYMENT_LINK"])
	}
	// The deep link is a scheme, not an origin, and must be untouched by this.
	if got := byType["DEEP_LINK"]; got != "banzami://pay/abc123" {
		t.Fatalf("DEEP_LINK = %q, want banzami://pay/abc123", got)
	}
}

// A trailing slash in configuration must not produce a double slash in a link
// someone is expected to open.
func TestPaymentSession_PayBaseURLTrailingSlashIsNormalised(t *testing.T) {
	h := psHandler("doa-merchant", false).WithPayBaseURL("https://pay.banzami.com/")
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://sandbox-api.banzami.com/v1/payment-sessions",
		`{"wallet_account_id":"wa-1","purpose":"DONATION"}`, "doa-merchant"))

	var resp struct {
		Interfaces []struct{ Type, Value string } `json:"interfaces"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	for _, i := range resp.Interfaces {
		if i.Type == "PAYMENT_LINK" && i.Value != "https://pay.banzami.com/pay/abc123" {
			t.Fatalf("PAYMENT_LINK = %q", i.Value)
		}
	}
}

// Unconfigured, the gateway keeps the old shape rather than inventing a host —
// and says so at startup. A wrong guess at the payer origin would be worse than
// the JSON route, because it would look right.
func TestPaymentSession_WithoutPayBaseURLTheLegacyShapeIsKept(t *testing.T) {
	h := psHandler("doa-merchant", false)
	rec := httptest.NewRecorder()
	h.Create(rec, reqWith("POST", "https://x/v1/payment-sessions",
		`{"wallet_account_id":"wa-1","purpose":"DONATION"}`, "doa-merchant"))

	var resp struct {
		Interfaces []struct{ Type, Value string } `json:"interfaces"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	for _, i := range resp.Interfaces {
		if i.Type == "PAYMENT_LINK" && i.Value != "https://x/public/pay/abc123" {
			t.Fatalf("PAYMENT_LINK = %q, want the unchanged legacy value", i.Value)
		}
	}
}
