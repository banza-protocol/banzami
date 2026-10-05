package handler

// Forgot-PIN is NOT an identity-lifecycle operation. It never sets status =
// ACTIVE and never reactivates an identity. The account must ALREADY be ACTIVE
// at the moment the PIN is actually changed — the status is re-checked at
// confirm time, not just when the OTP is requested. These DB-backed tests prove
// the ACTIVE / SUSPENDED / CLOSED outcomes and the ACTIVE→(suspended/closed)
// race between issuing the reset grant and consuming it.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	ce "github.com/banzami/banzami/services/common/email"
	"github.com/banzami/banzami/services/public-api/internal/config"
	"github.com/banzami/banzami/services/public-api/internal/service"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func resetHandlerOrSkip(t *testing.T) (*AuthHandler, *service.ConsumerRecoveryService, *pgxpool.Pool) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed pin-reset test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cfg := &config.Config{JWTSecret: "test-secret", Environment: "SANDBOX"}
	creds := service.NewCredentialStore(pool)
	rec := service.NewConsumerRecoveryService(pool, "test-pepper")
	// A dry-run sender is Enabled() (transport + from + noreply set) but sends
	// nothing — so recoveryEnabled() is true without delivering real email.
	mailer := ce.NewSender(ce.Config{
		DryRun: true, ResendAPIKey: "test", FromAddress: "no-reply@banzami.test",
		NoreplyAddress: "no-reply@banzami.test", NoreplyName: "Banzami",
	})
	if !mailer.Enabled() {
		t.Fatal("dry-run mailer should be Enabled()")
	}
	h := NewAuthHandler(cfg, service.NewCorePublicClient("http://unused"), creds).WithRecovery(rec, mailer)
	return h, rec, pool
}

// seed makes an ACTIVE consumer with a verified email and a known PIN hash.
func seedResetConsumer(t *testing.T, pool *pgxpool.Pool, status string) (id, handle, pinHash string) {
	t.Helper()
	ctx := context.Background()
	id = uuid.NewString()
	handle = "pr" + id[:8]
	email := "pr-" + id[:8] + "@banzami-e2e.test"
	if _, err := pool.Exec(ctx,
		`INSERT INTO consumers (id, handle, status, display_name, email, email_verified_at)
		 VALUES ($1,$2,$3,$2,$4, now())`, id, handle, status, email); err != nil {
		t.Fatal(err)
	}
	h, _ := bcrypt.GenerateFromPassword([]byte("111111"), bcrypt.MinCost)
	pinHash = string(h)
	if _, err := pool.Exec(ctx,
		`INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`,
		id, handle, pinHash); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_auth_grants WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, id)
	})
	return
}

// issueResetToken drives the service to a PIN_RESET grant for a consumer whose
// email is verified (the account is ACTIVE at issue time).
func issueResetToken(t *testing.T, rec *service.ConsumerRecoveryService, id, handle string) string {
	t.Helper()
	ctx := context.Background()
	email := "pr-" + id[:8] + "@banzami-e2e.test"
	code, err := rec.RequestPinResetOtp(ctx, id, email, "")
	if err != nil {
		t.Fatalf("request reset otp: %v", err)
	}
	token, err := rec.VerifyPinResetOtp(ctx, id, code)
	if err != nil {
		t.Fatalf("verify reset otp: %v", err)
	}
	return token
}

func confirmReset(t *testing.T, h *AuthHandler, token, newPin string) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/pin-reset/confirm",
		strings.NewReader(`{"reset_token":"`+token+`","new_pin":"`+newPin+`"}`))
	h.ConfirmPinReset(rr, req)
	return rr
}

func statusOf(t *testing.T, pool *pgxpool.Pool, id string) string {
	t.Helper()
	var s string
	if err := pool.QueryRow(context.Background(), `SELECT status FROM consumers WHERE id=$1`, id).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func pinHashOf(t *testing.T, pool *pgxpool.Pool, id string) string {
	t.Helper()
	var s string
	if err := pool.QueryRow(context.Background(), `SELECT pin_hash FROM public_api_credentials WHERE consumer_id=$1`, id).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestConfirmPinReset_ActiveChangesPinAndKeepsStatusActive(t *testing.T) {
	h, rec, pool := resetHandlerOrSkip(t)
	id, handle, oldHash := seedResetConsumer(t, pool, "ACTIVE")
	token := issueResetToken(t, rec, id, handle)

	rr := confirmReset(t, h, token, "654321")
	if rr.Code != http.StatusOK {
		t.Fatalf("active reset should succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if s := statusOf(t, pool, id); s != "ACTIVE" {
		t.Fatalf("status must stay ACTIVE, got %s", s)
	}
	if pinHashOf(t, pool, id) == oldHash {
		t.Fatal("the PIN hash should have changed")
	}
}

func TestConfirmPinReset_SuspendedRefusedAndUnchanged(t *testing.T) {
	h, rec, pool := resetHandlerOrSkip(t)
	id, handle, oldHash := seedResetConsumer(t, pool, "SUSPENDED")
	token := issueResetToken(t, rec, id, handle)

	rr := confirmReset(t, h, token, "654321")
	if rr.Code == http.StatusOK {
		t.Fatalf("a suspended account must not be reset, got 200")
	}
	if s := statusOf(t, pool, id); s != "SUSPENDED" {
		t.Fatalf("status must stay SUSPENDED, got %s", s)
	}
	if pinHashOf(t, pool, id) != oldHash {
		t.Fatal("the PIN hash must be unchanged for a refused reset")
	}
}

func TestConfirmPinReset_ClosedRefusedAndLoginStaysImpossible(t *testing.T) {
	h, rec, pool := resetHandlerOrSkip(t)
	id, handle, oldHash := seedResetConsumer(t, pool, "CLOSED")
	token := issueResetToken(t, rec, id, handle)

	rr := confirmReset(t, h, token, "654321")
	if rr.Code == http.StatusOK {
		t.Fatalf("a closed account must not be reset, got 200")
	}
	if s := statusOf(t, pool, id); s != "CLOSED" {
		t.Fatalf("status must stay CLOSED, got %s", s)
	}
	if pinHashOf(t, pool, id) != oldHash {
		t.Fatal("the credential must not be rewritten for a closed account")
	}
	// Login stays impossible: Verify refuses a non-ACTIVE consumer.
	if _, _, err := service.NewCredentialStore(pool).Verify(context.Background(), handle, "654321"); err == nil {
		t.Fatal("a closed account must never sign in after a refused reset")
	}
}

// The race the brief calls out: ACTIVE at grant-issue time, suspended/closed
// before the grant is consumed. The status is re-checked at confirm, so the
// reset is refused.
func TestConfirmPinReset_RaceActiveThenSuspended(t *testing.T) {
	h, rec, pool := resetHandlerOrSkip(t)
	id, handle, oldHash := seedResetConsumer(t, pool, "ACTIVE")
	token := issueResetToken(t, rec, id, handle) // issued while ACTIVE

	// The operator suspends the account after the grant was issued.
	if _, err := pool.Exec(context.Background(), `UPDATE consumers SET status='SUSPENDED' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}

	rr := confirmReset(t, h, token, "654321")
	if rr.Code == http.StatusOK {
		t.Fatalf("a reset must be refused once the account is suspended, got 200")
	}
	if s := statusOf(t, pool, id); s != "SUSPENDED" {
		t.Fatalf("status must stay SUSPENDED, got %s", s)
	}
	if pinHashOf(t, pool, id) != oldHash {
		t.Fatal("the PIN must be unchanged when the reset loses the race")
	}
}
