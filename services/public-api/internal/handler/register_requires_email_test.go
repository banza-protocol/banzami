package handler

// A new Consumer account can never be created without a verified email. When the
// email/OTP subsystem is unavailable, registration fails closed: no consumer, no
// credential, no wallet, no financial identity is reserved. The rule lives on the
// server — an old client that omits email/token cannot bypass it.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRegister_FailsClosedWhenEmailSubsystemUnavailable(t *testing.T) {
	// A core server that records whether it was ever touched. If registration
	// fails closed, Core (CreateConsumer, wallet, grant) is never called.
	var coreHits int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&coreHits, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer core.Close()

	cfg := &config.Config{JWTSecret: "test-secret", Environment: "SANDBOX"}
	// No WithRecovery → the email subsystem is unavailable (recoveryEnabled()=false).
	// creds has a nil pool on purpose: it must never be reached.
	h := NewAuthHandler(cfg, service.NewCorePublicClient(core.URL), service.NewCredentialStore(nil))

	// A fully-formed body, including an email + a verification token: even a
	// client that supplies everything must not get an account while the subsystem
	// that could verify the email is down.
	body := `{"handle":"ana123","display_name":"Ana","pin":"123456","email":"ana@example.co","email_verification_token":"whatever"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(body))
	h.Register(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 fail-closed, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "SIGNUP_UNAVAILABLE") {
		t.Fatalf("expected SIGNUP_UNAVAILABLE, got %s", rec.Body.String())
	}
	if n := atomic.LoadInt32(&coreHits); n != 0 {
		t.Fatalf("Core must not be touched when signup fails closed — got %d calls (a consumer/wallet may have been created)", n)
	}
}

// Even with the email subsystem UP, an old client that omits the email or the
// verification grant cannot create an account. The rule is server-side; the
// refusal happens before any account/wallet work (Core is never touched). No DB
// is needed — these refusals return before any query (the lazy pool never dials).
func TestRegister_RecoveryEnabledRejectsMissingEmailOrGrant(t *testing.T) {
	var coreHits int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&coreHits, 1)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer core.Close()

	// A lazily-created pool (never dialed, since every case below returns before
	// a query) lets NewConsumerRecoveryService be non-nil → recoveryEnabled()=true.
	pool, err := pgxpool.New(context.Background(), "postgres://u:p@127.0.0.1:1/db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	mailer := ce.NewSender(ce.Config{
		DryRun: true, ResendAPIKey: "test", FromAddress: "n@banzami.test", NoreplyAddress: "n@banzami.test",
	})
	cfg := &config.Config{JWTSecret: "test-secret", Environment: "SANDBOX"}
	h := NewAuthHandler(cfg, service.NewCorePublicClient(core.URL), service.NewCredentialStore(pool)).
		WithRecovery(service.NewConsumerRecoveryService(pool, "pepper"), mailer)
	if !h.recoveryEnabled() {
		t.Fatal("precondition: recovery should be enabled for this test")
	}

	cases := []struct {
		name, body string
	}{
		{"no email", `{"handle":"ana123","display_name":"Ana","pin":"123456","email_verification_token":"x"}`},
		{"no grant", `{"handle":"ana123","display_name":"Ana","pin":"123456","email":"ana@example.co"}`},
		{"bad email", `{"handle":"ana123","display_name":"Ana","pin":"123456","email":"not-an-email","email_verification_token":"x"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(c.body))
			h.Register(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("%s: expected 400, got %d: %s", c.name, rr.Code, rr.Body.String())
			}
		})
	}
	if n := atomic.LoadInt32(&coreHits); n != 0 {
		t.Fatalf("Core must not be touched when the email/grant is missing — got %d calls", n)
	}
}
