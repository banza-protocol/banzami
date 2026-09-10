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

// ownedQrService returns a dynamic QR owned by the configured merchant and
// records whether MarkUsed was reached — the authorisation check must reject
// before the code can be burned.
type ownedQrService struct {
	ownerType, ownerID string
	markedUsed         int
}

func (f *ownedQrService) CreateStatic(context.Context, service.CreateStaticQrRequest) (*service.QrResponse, error) {
	return nil, nil
}
func (f *ownedQrService) CreateDynamic(context.Context, service.CreateDynamicQrRequest) (*service.QrResponse, error) {
	return nil, nil
}
func (f *ownedQrService) Get(_ context.Context, id string) (*service.QrResponse, error) {
	return &service.QrResponse{
		QrCode: &service.QrCodeRecord{
			ID: id, OwnerID: f.ownerID, OwnerType: f.ownerType,
			QrType: "DYNAMIC", Currency: "AOA", Status: "ACTIVE",
		},
		Payload: "payload",
	}, nil
}
func (f *ownedQrService) Decode(context.Context, string) (*service.ParsedQr, error) { return nil, nil }
func (f *ownedQrService) MarkUsed(_ context.Context, id string) (*service.QrCodeRecord, error) {
	f.markedUsed++
	return &service.QrCodeRecord{ID: id, Status: "USED"}, nil
}
func (f *ownedQrService) Pay(context.Context, service.PayQrRequest) (int, json.RawMessage, error) {
	return 200, nil, nil
}

func qrReq(method, path, qrID, callerMerchant string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", qrID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	if callerMerchant == "" {
		return req
	}
	return req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: callerMerchant, Environment: "LIVE"}))
}

// SEC-016, the damaging case: burning another merchant's single-use dynamic QR.
// Each dynamic code may be redeemed once, so marking a competitor's code used
// makes the legitimate payer's scan fail with QR_ALREADY_USED — payment
// disruption reachable with nothing but a QR id.
func TestQrMarkUsed_RejectsCrossMerchant(t *testing.T) {
	svc := &ownedQrService{ownerType: "MERCHANT", ownerID: "victim-merchant"}
	h := NewQrHandler(svc)

	rec := httptest.NewRecorder()
	h.MarkUsed(rec, qrReq("POST", "/v1/qr/qr-victim/use", "qr-victim", "attacker-merchant"))

	if svc.markedUsed != 0 {
		t.Fatal("another merchant's QR code was burned")
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestQrGet_RejectsCrossMerchant(t *testing.T) {
	h := NewQrHandler(&ownedQrService{ownerType: "MERCHANT", ownerID: "victim-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, qrReq("GET", "/v1/qr/qr-victim", "qr-victim", "attacker-merchant"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if contains(rec.Body.String(), "victim-merchant") {
		t.Fatal("response leaked the owning merchant id")
	}
}

// A QR owned by a CONSUMER must not be reachable from the merchant surface
// either — ownership is (type, id), not id alone.
func TestQrGet_RejectsConsumerOwnedCode(t *testing.T) {
	h := NewQrHandler(&ownedQrService{ownerType: "CONSUMER", ownerID: "same-id"})

	rec := httptest.NewRecorder()
	h.Get(rec, qrReq("GET", "/v1/qr/qr-x", "qr-x", "same-id"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("consumer-owned QR reachable from the merchant surface: %d", rec.Code)
	}
}

// The owner keeps working.
func TestQrGet_OwnerStillAllowed(t *testing.T) {
	h := NewQrHandler(&ownedQrService{ownerType: "MERCHANT", ownerID: "own-merchant"})

	rec := httptest.NewRecorder()
	h.Get(rec, qrReq("GET", "/v1/qr/qr-own", "qr-own", "own-merchant"))

	if rec.Code != http.StatusOK {
		t.Fatalf("owner denied its own QR: %d %s", rec.Code, rec.Body.String())
	}
}

func TestQrMarkUsed_OwnerStillAllowed(t *testing.T) {
	svc := &ownedQrService{ownerType: "MERCHANT", ownerID: "own-merchant"}
	h := NewQrHandler(svc)

	rec := httptest.NewRecorder()
	h.MarkUsed(rec, qrReq("POST", "/v1/qr/qr-own/use", "qr-own", "own-merchant"))

	if rec.Code != http.StatusOK || svc.markedUsed != 1 {
		t.Fatalf("owner denied marking own QR used: code=%d marked=%d", rec.Code, svc.markedUsed)
	}
}

// Unauthenticated callers never reach the service.
func TestQrMarkUsed_RejectsUnauthenticated(t *testing.T) {
	svc := &ownedQrService{ownerType: "MERCHANT", ownerID: "victim-merchant"}
	h := NewQrHandler(svc)

	rec := httptest.NewRecorder()
	h.MarkUsed(rec, qrReq("POST", "/v1/qr/qr-victim/use", "qr-victim", ""))

	if rec.Code != http.StatusForbidden || svc.markedUsed != 0 {
		t.Fatalf("unauthenticated burn not blocked: code=%d marked=%d", rec.Code, svc.markedUsed)
	}
}

// A Business may create QR codes owned by itself and nothing else. The
// CONSUMER branch used to pass unchecked, so a Business could mint a QR owned
// by any consumer id it named.
func TestQrCreateStatic_OnlyForTheAuthenticatedBusiness(t *testing.T) {
	h := NewQrHandler(&ownedQrService{})
	for name, c := range map[string]struct {
		body string
		want int
	}{
		"a consumer's QR":       {`{"owner_type":"CONSUMER","owner_id":"consumer-1","currency":"AOA"}`, http.StatusForbidden},
		"another Business's QR": {`{"owner_type":"MERCHANT","owner_id":"victim-merchant","currency":"AOA"}`, http.StatusForbidden},
		"its own QR":            {`{"owner_type":"MERCHANT","owner_id":"attacker-merchant","currency":"AOA"}`, 0},
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/qr/static", strings.NewReader(c.body))
			req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
				&middleware.Principal{MerchantID: "attacker-merchant", Environment: "SANDBOX"}))
			rec := httptest.NewRecorder()
			h.CreateStatic(rec, req)
			if c.want != 0 && rec.Code != c.want {
				t.Fatalf("status %d, want %d", rec.Code, c.want)
			}
			if c.want == 0 && rec.Code == http.StatusForbidden {
				t.Fatalf("a Business was refused its own QR")
			}
		})
	}
}

// collectionSpy embeds the interface as nil: only Create is exercised.
type collectionSpy struct {
	service.CollectionService
	created int
}

func (c *collectionSpy) Create(context.Context, string, string, map[string]any) (int, json.RawMessage, error) {
	c.created++
	return http.StatusCreated, json.RawMessage(`{}`), nil
}

// A collection pays into the wallet it names; it must be the Business's own.
func TestCollectionCreate_OnlyIntoTheBusinessOwnWallet(t *testing.T) {
	spy := &collectionSpy{}
	h := NewCollectionHandler(spy).WithWallets(&fakeWallets{merchantID: "victim-merchant"})
	req := httptest.NewRequest(http.MethodPost, "/v1/collections", strings.NewReader(`{"wallet_id":"w-victim"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: "attacker-merchant", Environment: "SANDBOX"}))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusNotFound || spy.created != 0 {
		t.Fatalf("status %d, created %d", rec.Code, spy.created)
	}
	own := NewCollectionHandler(spy).WithWallets(&fakeWallets{merchantID: "attacker-merchant"})
	req = httptest.NewRequest(http.MethodPost, "/v1/collections", strings.NewReader(`{"wallet_id":"w-own"}`))
	req = req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: "attacker-merchant", Environment: "SANDBOX"}))
	rec = httptest.NewRecorder()
	own.Create(rec, req)
	if rec.Code != http.StatusCreated || spy.created != 1 {
		t.Fatalf("a Business's own collection: %d", rec.Code)
	}
}
