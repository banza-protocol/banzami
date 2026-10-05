package handler

// "Suprimir conta Business" spans three processes: the api-gateway (this handler),
// Core (the ledger-safe retire + CLOSED), and this service's own session/credential
// stores. It is a durable, idempotent orchestration, not one ACID transaction, so
// its boundaries can fail independently. These tests pin the orchestration contract:
//
//   - Core delete is the point of no return. Once it succeeds the account is
//     already unusable (CLOSED blocks every sign-in — proven in the service tests),
//     so a later failure to revoke sessions or delete the credential must NOT fail
//     the request and must NOT leave the account recoverable.
//   - A Core refusal because a settlement is in flight surfaces as 409, and the
//     cleanup steps are never reached (nothing was deleted).
//   - A wrong PIN is refused before Core is ever called.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/banzami/banzami/services/api-gateway/internal/middleware"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// delCreds is a credential fake for the deletion handler: it records the PIN
// re-auth and the credential removal, and can be made to fail either.
type delCreds struct {
	fakeCreds
	verifyPinErr error
	deleteErr    error
	deleteCalls  int
}

func (c *delCreds) VerifyPinByMerchantID(_ context.Context, _, _, _ string) error {
	return c.verifyPinErr
}
func (c *delCreds) DeleteCredentialByMerchant(_ context.Context, _, _ string) error {
	c.deleteCalls++
	return c.deleteErr
}

// delSessions records revoke-all and can be made to fail it.
type delSessions struct {
	fakeSessions
	revokeErr   error
	revokeCalls int
}

func (s *delSessions) RevokeAllForMerchant(_ context.Context, mid, _ string) error {
	s.revokeCalls++
	s.revokedAll = append(s.revokedAll, mid)
	return s.revokeErr
}

func deletionRequest(t *testing.T, h *MerchantDeletionHandler, p *middleware.Principal, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/merchant/deletion", strings.NewReader(body))
	if p != nil {
		req = req.WithContext(middleware.ContextWithPrincipal(req.Context(), p))
	}
	rec := httptest.NewRecorder()
	h.Delete(rec, req)
	return rec
}

// coreStub serves the core delete endpoint with a fixed status.
func coreStub(t *testing.T, status int) *service.CoreApiClient {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)
	return service.NewCoreApiClient(srv.URL, "")
}

func TestMerchantDeletion_CleanupFailureAfterCoreDeleteStillSucceeds(t *testing.T) {
	core := coreStub(t, http.StatusOK)
	creds := &delCreds{deleteErr: errors.New("credential store unreachable")}
	sessions := &delSessions{revokeErr: errors.New("session store unreachable")}
	h := NewMerchantDeletionHandler(core, creds, sessions)

	p := &middleware.Principal{MerchantID: "m-partial", Environment: "SANDBOX"}
	rec := deletionRequest(t, h, p, `{"pin":"1234"}`)

	// Core already closed the account; the cleanup failures must not fail the
	// request — the account is unusable regardless.
	if rec.Code != http.StatusOK {
		t.Fatalf("cleanup failure after a successful Core delete should still return 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// Both cleanup steps were attempted (best-effort, so the operator's retry has
	// a record), and attempted against the session's merchant id.
	if sessions.revokeCalls != 1 || len(sessions.revokedAll) != 1 || sessions.revokedAll[0] != "m-partial" {
		t.Fatalf("revoke-all should be attempted once for the session's merchant, got calls=%d ids=%v", sessions.revokeCalls, sessions.revokedAll)
	}
	if creds.deleteCalls != 1 {
		t.Fatalf("credential removal should be attempted once, got %d", creds.deleteCalls)
	}
}

func TestMerchantDeletion_PendingSettlementIsConflictAndSkipsCleanup(t *testing.T) {
	core := coreStub(t, http.StatusConflict) // Core refuses: a settlement is in flight
	creds := &delCreds{}
	sessions := &delSessions{}
	h := NewMerchantDeletionHandler(core, creds, sessions)

	p := &middleware.Principal{MerchantID: "m-pending", Environment: "SANDBOX"}
	rec := deletionRequest(t, h, p, `{"pin":"1234"}`)

	if rec.Code != http.StatusConflict {
		t.Fatalf("a Core 409 (pending settlement) should surface as 409, got %d: %s", rec.Code, rec.Body.String())
	}
	// Nothing was deleted: the account is still fully usable, so no cleanup ran.
	if sessions.revokeCalls != 0 || creds.deleteCalls != 0 {
		t.Fatalf("no cleanup must run when Core refused the delete, got revoke=%d delete=%d", sessions.revokeCalls, creds.deleteCalls)
	}
}

func TestMerchantDeletion_WrongPinNeverReachesCore(t *testing.T) {
	core := coreStub(t, http.StatusOK)
	creds := &delCreds{verifyPinErr: service.ErrMerchantCredsInvalid}
	sessions := &delSessions{}
	h := NewMerchantDeletionHandler(core, creds, sessions)

	p := &middleware.Principal{MerchantID: "m-wrongpin", Environment: "SANDBOX"}
	rec := deletionRequest(t, h, p, `{"pin":"0000"}`)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("a wrong PIN should be refused with 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if sessions.revokeCalls != 0 || creds.deleteCalls != 0 {
		t.Fatalf("a refused re-auth must not touch sessions or credentials, got revoke=%d delete=%d", sessions.revokeCalls, creds.deleteCalls)
	}
}

func TestMerchantDeletion_RequiresAuthenticatedBusiness(t *testing.T) {
	core := coreStub(t, http.StatusOK)
	h := NewMerchantDeletionHandler(core, &delCreds{}, &delSessions{})

	// No principal in context (never signed in).
	rec := deletionRequest(t, h, nil, `{"pin":"1234"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a request with no Business session should be 401, got %d", rec.Code)
	}
}

func TestMerchantDeletion_PinRequired(t *testing.T) {
	core := coreStub(t, http.StatusOK)
	h := NewMerchantDeletionHandler(core, &delCreds{}, &delSessions{})

	p := &middleware.Principal{MerchantID: "m-nopin", Environment: "SANDBOX"}
	rec := deletionRequest(t, h, p, `{}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a missing PIN should be 400, got %d", rec.Code)
	}
}
