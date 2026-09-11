package handler

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// recordingQrService captures what the handler asks core for.
type recordingQrService struct {
	ownedQrService
	static  *service.CreateStaticQrRequest
	dynamic *service.CreateDynamicQrRequest
}

func (f *recordingQrService) CreateStatic(_ context.Context, r service.CreateStaticQrRequest) (*service.QrResponse, error) {
	f.static = &r
	return &service.QrResponse{}, nil
}
func (f *recordingQrService) CreateDynamic(_ context.Context, r service.CreateDynamicQrRequest) (*service.QrResponse, error) {
	f.dynamic = &r
	return &service.QrResponse{}, nil
}

// @banzami/sdk sends createStaticQr as {owner_id} and createDynamicQr without
// owner_type. The only owner a Business may name is itself and the operator
// settles in Kwanza, so both are filled — and every call used to be refused.
func TestQrCreate_AcceptsTheSDKsBody(t *testing.T) {
	svc := &recordingQrService{}
	h := NewQrHandler(svc)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/qr/static", strings.NewReader(`{"owner_id":"m-1"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: "m-1", Environment: "SANDBOX"}))
	h.CreateStatic(rec, req)
	if rec.Code != 201 || svc.static == nil || svc.static.OwnerType != "MERCHANT" || svc.static.Currency != "AOA" {
		t.Fatalf("static: %d %s %+v", rec.Code, rec.Body.String(), svc.static)
	}

	rec = httptest.NewRecorder()
	exp := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	req = httptest.NewRequest("POST", "/v1/qr/dynamic", strings.NewReader(`{"owner_id":"m-1","amount_minor":5000,"currency":"AOA","expires_at":"`+exp+`"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: "m-1", Environment: "SANDBOX"}))
	h.CreateDynamic(rec, req)
	if rec.Code != 201 || svc.dynamic == nil || svc.dynamic.OwnerType != "MERCHANT" {
		t.Fatalf("dynamic: %d %s %+v", rec.Code, rec.Body.String(), svc.dynamic)
	}

	// A default is not a way around the owner check: another Business's id, or
	// an explicit CONSUMER owner, is still refused.
	for _, body := range []string{`{"owner_id":"m-2"}`, `{"owner_id":"m-1","owner_type":"CONSUMER"}`} {
		rec = httptest.NewRecorder()
		req = httptest.NewRequest("POST", "/v1/qr/static", strings.NewReader(body))
		req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), &middleware.Principal{MerchantID: "m-1", Environment: "SANDBOX"}))
		h.CreateStatic(rec, req)
		if rec.Code != 403 {
			t.Fatalf("%s: %d, want 403", body, rec.Code)
		}
	}
}
