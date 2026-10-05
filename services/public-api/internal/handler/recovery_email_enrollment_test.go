package handler

// Legacy accounts (email NULL) keep signing in with @banza + PIN. They cannot
// use automatic PIN recovery until they add + verify a recovery email while
// authenticated. These DB-backed tests cover the enrolment invariants:
//   - a legacy account reports no recovery email, and is not a reset target;
//   - the add-email endpoints refuse once an email is already set;
//   - once an email is verified-associated, the account becomes a reset target
//     (so "Esqueci o PIN" works) — identified by @banza, never by email.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/middleware"
	"github.com/banzami/banzami/services/public-api/internal/service"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRecoveryEmailEnrollment_LegacyLifecycle(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed recovery-email enrolment test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	creds := service.NewCredentialStore(pool)
	rec := service.NewConsumerRecoveryService(pool, "test-pepper")
	mailer := ce.NewSender(ce.Config{DryRun: true, ResendAPIKey: "t", FromAddress: "n@b.co", NoreplyAddress: "n@b.co"})
	cfg := &config.Config{JWTSecret: "s", Environment: "SANDBOX"}
	h := NewAuthHandler(cfg, service.NewCorePublicClient("http://unused"), creds).WithRecovery(rec, mailer)

	// A legacy consumer: ACTIVE, no email.
	id := uuid.NewString()
	handle := "le" + id[:8]
	if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`, id, handle); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,'x')`, id, handle); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, id)
	})

	authed := func(method, body string) *http.Request {
		req := httptest.NewRequest(method, "/v1/me/recovery-email", strings.NewReader(body))
		return req.WithContext(middleware.InjectConsumer(req.Context(), &middleware.Consumer{ID: id}))
	}

	// Legacy account: no recovery email, and not an eligible reset target.
	rr := httptest.NewRecorder()
	h.RecoveryEmailStatus(rr, authed(http.MethodGet, ""))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"has_email":false`) {
		t.Fatalf("legacy account should report has_email=false, got %d %s", rr.Code, rr.Body.String())
	}
	if tgt, err := creds.LookupResetTarget(ctx, handle); err != nil || tgt.Eligible {
		t.Fatalf("legacy account must not be a reset target before adding an email, got %+v %v", tgt, err)
	}

	// Simulate a completed enrolment (Core would set this after OTP verify).
	email := "le-" + id[:8] + "@banzami-e2e.test"
	if _, err := pool.Exec(ctx, `UPDATE consumers SET email=lower($2), email_verified_at=now() WHERE id=$1`, id, email); err != nil {
		t.Fatal(err)
	}

	// Now a recovery email is reported (masked), and the account is a reset
	// target — "Esqueci o PIN" (identified by @banza) will work.
	rr = httptest.NewRecorder()
	h.RecoveryEmailStatus(rr, authed(http.MethodGet, ""))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"has_email":true`) || !strings.Contains(rr.Body.String(), "***") {
		t.Fatalf("after enrolment status should be has_email=true + masked, got %s", rr.Body.String())
	}
	if tgt, err := creds.LookupResetTarget(ctx, handle); err != nil || !tgt.Eligible || tgt.Email != email {
		t.Fatalf("after enrolment the account should be an eligible reset target, got %+v %v", tgt, err)
	}

	// Adding another email is refused once one exists (no arbitrary change here).
	rr = httptest.NewRecorder()
	h.RequestRecoveryEmailOtp(rr, authed(http.MethodPost, `{"email":"other@banzami-e2e.test"}`))
	if rr.Code != http.StatusConflict || !strings.Contains(rr.Body.String(), "EMAIL_ALREADY_SET") {
		t.Fatalf("adding a second recovery email should be refused 409 EMAIL_ALREADY_SET, got %d %s", rr.Code, rr.Body.String())
	}
}
