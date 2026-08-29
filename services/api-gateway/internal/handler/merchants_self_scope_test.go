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

// recordingMerchants records whether the service layer was reached at all — the
// authorisation check must reject BEFORE any merchant/API-key operation runs.
type recordingMerchants struct {
	createdKeys int
	listedKeys  int
	revoked     int
	suspended   int
	got         int
}

func (f *recordingMerchants) Create(ctx context.Context, in service.CreateMerchantRequest) (*service.MerchantRecord, error) {
	return &service.MerchantRecord{ID: "m-new"}, nil
}
func (f *recordingMerchants) Get(ctx context.Context, id string) (*service.MerchantRecord, error) {
	f.got++
	return &service.MerchantRecord{ID: id, Status: service.MerchantStatusActive}, nil
}
func (f *recordingMerchants) Suspend(ctx context.Context, id string) (*service.MerchantRecord, error) {
	f.suspended++
	return &service.MerchantRecord{ID: id, Status: "SUSPENDED"}, nil
}
func (f *recordingMerchants) CreateApiKey(ctx context.Context, merchantID, name string, env service.ApiKeyEnvironment) (*service.ApiKeyWithSecret, error) {
	f.createdKeys++
	return &service.ApiKeyWithSecret{}, nil
}
func (f *recordingMerchants) ListApiKeys(ctx context.Context, merchantID string) ([]*service.ApiKeyRecord, error) {
	f.listedKeys++
	return nil, nil
}
func (f *recordingMerchants) RevokeApiKey(ctx context.Context, merchantID, keyID string) error {
	f.revoked++
	return nil
}

func (f *recordingMerchants) VerifyApiKey(ctx context.Context, rawKey string) (*service.MerchantRecord, service.ApiKeyEnvironment, error) {
	return nil, service.ApiKeyEnvironmentSandbox, nil
}

func merchantReq(method, path, urlMerchantID, callerMerchantID, body string) *http.Request {
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", urlMerchantID)
	rctx.URLParams.Add("keyID", "key-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	return req.WithContext(middleware.ContextWithPrincipal(req.Context(),
		&middleware.Principal{MerchantID: callerMerchantID, Scopes: []string{"*"}, Environment: "LIVE"}))
}

// SEC-003, the most severe case: minting a LIVE API key for another merchant.
// The response of this route carries the plaintext key, so success would hand
// the attacker full payment authority over the victim's Business Account.
func TestCreateApiKey_RejectsOtherMerchant(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)

	rec := httptest.NewRecorder()
	h.CreateApiKey(rec, merchantReq("POST", "/v1/merchants/victim/api-keys", "victim-merchant", "attacker-merchant",
		`{"name":"pwn","environment":"LIVE"}`))

	if rec.Code == http.StatusCreated {
		t.Fatalf("minted an API key for another merchant: %s", rec.Body.String())
	}
	if svc.createdKeys != 0 {
		t.Fatal("reached the key-minting service on an unauthorised request")
	}
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}

func TestListApiKeys_RejectsOtherMerchant(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	rec := httptest.NewRecorder()
	h.ListApiKeys(rec, merchantReq("GET", "/v1/merchants/victim/api-keys", "victim-merchant", "attacker-merchant", ""))
	if rec.Code != http.StatusNotFound || svc.listedKeys != 0 {
		t.Fatalf("cross-merchant key listing not blocked: code=%d listed=%d", rec.Code, svc.listedKeys)
	}
}

// Revoking another merchant's keys would lock them out of their own integration.
func TestRevokeApiKey_RejectsOtherMerchant(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	rec := httptest.NewRecorder()
	h.RevokeApiKey(rec, merchantReq("DELETE", "/v1/merchants/victim/api-keys/key-1", "victim-merchant", "attacker-merchant", ""))
	if rec.Code != http.StatusNotFound || svc.revoked != 0 {
		t.Fatalf("cross-merchant key revocation not blocked: code=%d revoked=%d", rec.Code, svc.revoked)
	}
}

// Suspending a competitor is a denial of service against their payments.
func TestSuspendMerchant_RejectsOtherMerchant(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	rec := httptest.NewRecorder()
	h.Suspend(rec, merchantReq("POST", "/v1/merchants/victim/suspend", "victim-merchant", "attacker-merchant", ""))
	if rec.Code != http.StatusNotFound || svc.suspended != 0 {
		t.Fatalf("cross-merchant suspend not blocked: code=%d suspended=%d", rec.Code, svc.suspended)
	}
}

func TestGetMerchant_RejectsOtherMerchant(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	rec := httptest.NewRecorder()
	h.Get(rec, merchantReq("GET", "/v1/merchants/victim", "victim-merchant", "attacker-merchant", ""))
	if rec.Code != http.StatusNotFound || svc.got != 0 {
		t.Fatalf("cross-merchant read not blocked: code=%d got=%d", rec.Code, svc.got)
	}
}

// Self-service must keep working: the owner reads its own record and manages
// its own keys.
func TestMerchantSelfServiceStillWorks(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)

	rec := httptest.NewRecorder()
	h.Get(rec, merchantReq("GET", "/v1/merchants/me", "own-merchant", "own-merchant", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("owner denied own merchant record: %d %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.CreateApiKey(rec, merchantReq("POST", "/v1/merchants/me/api-keys", "own-merchant", "own-merchant",
		`{"name":"my key","environment":"SANDBOX"}`))
	if rec.Code != http.StatusCreated || svc.createdKeys != 1 {
		t.Fatalf("owner denied own key creation: %d %s", rec.Code, rec.Body.String())
	}
}

// An unauthenticated caller never reaches the service.
func TestMerchantRoutes_RejectUnauthenticated(t *testing.T) {
	svc := &recordingMerchants{}
	h := NewMerchantHandler(svc)
	req := httptest.NewRequest("POST", "/v1/merchants/victim/api-keys", strings.NewReader(`{"name":"x"}`))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "victim-merchant")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rec := httptest.NewRecorder()
	h.CreateApiKey(rec, req)
	if rec.Code != http.StatusUnauthorized || svc.createdKeys != 0 {
		t.Fatalf("unauthenticated key creation not blocked: code=%d", rec.Code)
	}
}
