package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

type fakeRefundSvc struct {
	got service.CreateRefundRequest
	err error
}

func (f *fakeRefundSvc) Create(_ context.Context, req service.CreateRefundRequest) (*service.Refund, error) {
	f.got = req
	if f.err != nil {
		return nil, f.err
	}
	return &service.Refund{
		ID: "r1", SourceType: req.CoreSourceType, SourceID: req.SourceID,
		MerchantID: req.MerchantID, AmountMinor: req.AmountMinor, Currency: req.Currency, Status: "SUCCEEDED",
	}, nil
}
func (f *fakeRefundSvc) Get(_ context.Context, _ string) (*service.Refund, error) {
	return nil, service.ErrRefundNotFound
}
func (f *fakeRefundSvc) List(_ context.Context, _, _ string, _ int) (*service.RefundPage, error) {
	return &service.RefundPage{}, nil
}

func refundReq(merchant, bodyJSON string) (*httptest.ResponseRecorder, *http.Request) {
	req := httptest.NewRequest(http.MethodPost, "/v1/refunds", strings.NewReader(bodyJSON))
	if merchant != "" {
		req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
			&middleware.Principal{MerchantID: merchant, Environment: "SANDBOX"}))
	}
	return httptest.NewRecorder(), req
}

func codeOf(w *httptest.ResponseRecorder) string {
	var r struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &r)
	return r.Code
}

// The operator surface must reject every ambiguous/invalid refund request BEFORE
// touching the core — no silent source inference (BANZA ADR-030 §2).
func TestRefundCreate_ValidationMatrix(t *testing.T) {
	cases := []struct {
		name, merchant, body string
		wantStatus           int
		wantCode             string
	}{
		{"no principal", "", `{"source_type":"ACQUIRING_PAYMENT","source_id":"x","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`, 401, "UNAUTHORIZED"},
		{"missing source_type", "m1", `{"source_id":"x","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`, 400, "MISSING_FIELD"},
		{"unknown source_type", "m1", `{"source_type":"TRANSFER","source_id":"x","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`, 400, "INVALID_SOURCE_TYPE"},
		{"lowercase source_type rejected", "m1", `{"source_type":"wallet_payment","source_id":"x","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`, 400, "INVALID_SOURCE_TYPE"},
		{"missing source_id", "m1", `{"source_type":"WALLET_PAYMENT","amount_minor":100,"currency":"AOA","idempotency_key":"k"}`, 400, "MISSING_FIELD"},
		{"zero amount", "m1", `{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":0,"currency":"AOA","idempotency_key":"k"}`, 400, "INVALID_AMOUNT"},
		{"negative amount", "m1", `{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":-5,"currency":"AOA","idempotency_key":"k"}`, 400, "INVALID_AMOUNT"},
		{"missing currency", "m1", `{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":100,"idempotency_key":"k"}`, 400, "MISSING_FIELD"},
		{"bad currency", "m1", `{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":100,"currency":"Kwanza","idempotency_key":"k"}`, 400, "INVALID_CURRENCY"},
		{"missing idem", "m1", `{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":100,"currency":"AOA"}`, 400, "MISSING_FIELD"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := NewRefundHandler(&fakeRefundSvc{})
			w, r := refundReq(c.merchant, c.body)
			h.Create(w, r)
			if w.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, c.wantStatus, w.Body.String())
			}
			if got := codeOf(w); got != c.wantCode {
				t.Fatalf("code = %q, want %q", got, c.wantCode)
			}
		})
	}
}

func TestRefundCreate_MapsPublicSourceToCore(t *testing.T) {
	t.Run("ACQUIRING_PAYMENT maps to core TRANSACTION", func(t *testing.T) {
		f := &fakeRefundSvc{}
		w, r := refundReq("m1", `{"source_type":"ACQUIRING_PAYMENT","source_id":"tx-1","amount_minor":2500,"currency":"AOA","idempotency_key":"k1"}`)
		NewRefundHandler(f).Create(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
		}
		if f.got.CoreSourceType != "TRANSACTION" {
			t.Fatalf("core source_type = %q, want TRANSACTION", f.got.CoreSourceType)
		}
		if f.got.SourceID != "tx-1" || f.got.MerchantID != "m1" || f.got.AmountMinor != 2500 || f.got.Currency != "AOA" {
			t.Fatalf("forwarded fields wrong: %+v", f.got)
		}
	})
	t.Run("WALLET_PAYMENT maps 1:1", func(t *testing.T) {
		f := &fakeRefundSvc{}
		w, r := refundReq("m1", `{"source_type":"WALLET_PAYMENT","source_id":"wp-1","amount_minor":100,"currency":"AOA","idempotency_key":"k2"}`)
		NewRefundHandler(f).Create(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("status=%d", w.Code)
		}
		if f.got.CoreSourceType != "WALLET_PAYMENT" {
			t.Fatalf("core source_type = %q, want WALLET_PAYMENT", f.got.CoreSourceType)
		}
	})
}

// A core rejection (ceiling/eligibility/authz/not-found) must surface with its
// real status + code, not a generic 500.
func TestRefundCreate_PropagatesCoreRejection(t *testing.T) {
	f := &fakeRefundSvc{err: &service.RefundError{Status: http.StatusUnprocessableEntity, Code: "REFUND_EXCEEDS_CAPTURED", Message: "over"}}
	w, r := refundReq("m1", `{"source_type":"WALLET_PAYMENT","source_id":"wp-1","amount_minor":100,"currency":"AOA","idempotency_key":"k3"}`)
	NewRefundHandler(f).Create(w, r)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want 422", w.Code)
	}
	if got := codeOf(w); got != "REFUND_EXCEEDS_CAPTURED" {
		t.Fatalf("code=%q, want REFUND_EXCEEDS_CAPTURED", got)
	}
}
