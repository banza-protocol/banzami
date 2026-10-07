package service

// DB-backed tests for the Consumer verified-email + PIN-recovery machinery.
// They prove the security contract the brief requires: codes are single-use,
// attempt-capped, expiring and replaced on re-request; the OTP is never the
// reset token (a separate single-use grant is); a reset grant burns any other
// pending reset material; and an ineligible account (not ACTIVE, or no verified
// email) is never a reset target.

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func recoveryPoolOrSkip(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed recovery test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func uniqueEmail() string { return "rcv-" + uuid.NewString()[:12] + "@banzami-e2e.test" }

func TestSignupOtp_FullLifecycle(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	svc := NewConsumerRecoveryService(pool, "test-pepper")
	if svc == nil {
		t.Fatal("service should construct with a pepper + pool")
	}
	email := uniqueEmail()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email)
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_auth_grants WHERE lower(email)=lower($1)`, email)
	})

	code, err := svc.RequestSignupOtp(ctx, email, "1.2.3.4")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	if len(code) != 6 {
		t.Fatalf("expected a 6-digit code, got %q", code)
	}
	// The raw code must be stored hashed, never in plaintext.
	var stored string
	if err := pool.QueryRow(ctx, `SELECT code_hash FROM consumer_email_otps WHERE lower(email)=lower($1) AND consumed_at IS NULL`, email).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == code || stored == "" {
		t.Fatalf("OTP must be stored hashed, not raw (stored=%q)", stored)
	}

	// A wrong code is refused and counts an attempt.
	wrong := "000000"
	if wrong == code {
		wrong = "111111"
	}
	if _, err := svc.VerifySignupOtp(ctx, email, wrong); !errors.Is(err, ErrRecoveryOtpInvalid) {
		t.Fatalf("wrong code should be refused, got %v", err)
	}
	var attempts int
	if err := pool.QueryRow(ctx, `SELECT attempts FROM consumer_email_otps WHERE lower(email)=lower($1) AND consumed_at IS NULL`, email).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if attempts != 1 {
		t.Fatalf("a wrong attempt should be counted even though the tx 'failed', got %d", attempts)
	}

	// The correct code yields a grant, and the OTP is now single-use (consumed).
	token, err := svc.VerifySignupOtp(ctx, email, code)
	if err != nil {
		t.Fatalf("correct code should verify, got %v", err)
	}
	if token == "" {
		t.Fatal("expected a grant token")
	}
	if _, err := svc.VerifySignupOtp(ctx, email, code); !errors.Is(err, ErrRecoveryOtpInvalid) {
		t.Fatalf("a consumed OTP must not verify again, got %v", err)
	}

	// The grant proves this email once; a replay fails.
	if err := svc.ConsumeEmailVerificationGrant(ctx, token, email); err != nil {
		t.Fatalf("grant should consume once, got %v", err)
	}
	if err := svc.ConsumeEmailVerificationGrant(ctx, token, email); !errors.Is(err, ErrGrantInvalid) {
		t.Fatalf("a consumed grant must not be reusable, got %v", err)
	}
}

func TestEmailVerificationGrant_RejectsMismatchedEmail(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	svc := NewConsumerRecoveryService(pool, "test-pepper")
	email := uniqueEmail()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email)
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_auth_grants WHERE lower(email)=lower($1)`, email)
	})
	code, err := svc.RequestSignupOtp(ctx, email, "")
	if err != nil {
		t.Fatal(err)
	}
	token, err := svc.VerifySignupOtp(ctx, email, code)
	if err != nil {
		t.Fatal(err)
	}
	// A grant for one email never validates a different email.
	if err := svc.ConsumeEmailVerificationGrant(ctx, token, uniqueEmail()); !errors.Is(err, ErrGrantInvalid) {
		t.Fatalf("a grant must not validate a different email, got %v", err)
	}
}

func TestSignupOtp_ExpiredAndLockedAndReplaced(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	svc := NewConsumerRecoveryService(pool, "test-pepper")

	// Expired.
	email := uniqueEmail()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email) })
	code, err := svc.RequestSignupOtp(ctx, email, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE consumer_email_otps SET expires_at=$2 WHERE lower(email)=lower($1)`, email, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.VerifySignupOtp(ctx, email, code); !errors.Is(err, ErrRecoveryOtpInvalid) {
		t.Fatalf("expired code should be refused, got %v", err)
	}

	// Locked after the attempt ceiling.
	email2 := uniqueEmail()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email2) })
	good, err := svc.RequestSignupOtp(ctx, email2, "")
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000000"
	if wrong == good {
		wrong = "111111"
	}
	for i := 0; i < recoveryMaxOTP; i++ {
		if _, err := svc.VerifySignupOtp(ctx, email2, wrong); !errors.Is(err, ErrRecoveryOtpInvalid) {
			t.Fatalf("attempt %d want invalid, got %v", i, err)
		}
	}
	if _, err := svc.VerifySignupOtp(ctx, email2, good); !errors.Is(err, ErrRecoveryOtpLocked) {
		t.Fatalf("after the ceiling even the right code is locked, got %v", err)
	}

	// Re-request replaces the live code (the old one no longer verifies).
	email3 := uniqueEmail()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email3) })
	first, err := svc.RequestSignupOtp(ctx, email3, "")
	if err != nil {
		t.Fatal(err)
	}
	// Age the first code past the canonical 60s resend cooldown so the re-request is
	// allowed; the re-request then supersedes (consumes) it, per the one-live-signup rule.
	if _, err := pool.Exec(ctx, `UPDATE consumer_email_otps SET created_at = now() - interval '90 seconds' WHERE lower(email)=lower($1)`, email3); err != nil {
		t.Fatal(err)
	}
	second, err := svc.RequestSignupOtp(ctx, email3, "")
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Skip("the two random codes collided; rerun")
	}
	if _, err := svc.VerifySignupOtp(ctx, email3, first); !errors.Is(err, ErrRecoveryOtpInvalid) {
		t.Fatalf("the superseded code must not verify, got %v", err)
	}
	if _, err := svc.VerifySignupOtp(ctx, email3, second); err != nil {
		t.Fatalf("the current code should verify, got %v", err)
	}
}

// seedConsumer makes an ACTIVE consumer with a credential and a verified email.
func seedConsumerWithEmail(t *testing.T, pool *pgxpool.Pool, status string, email string) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.NewString()
	handle := "rc" + id[:8]
	var emailArg any
	if email != "" {
		emailArg = email
	}
	if _, err := pool.Exec(ctx,
		// $4 is cast to text explicitly: it is passed as an untyped nil for the
		// no-email case and, used only inside CASE WHEN $4 IS NULL, Postgres cannot
		// otherwise infer its type (SQLSTATE 42P08).
		`INSERT INTO consumers (id, handle, status, display_name, email, email_verified_at)
		 VALUES ($1,$2,$3,$2,$4::text, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END)`,
		id, handle, status, emailArg); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,'x')`, id, handle); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumer_auth_grants WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, id)
	})
	return id
}

func TestPinReset_GrantIsSeparateSingleUseAndBurnsOthers(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	svc := NewConsumerRecoveryService(pool, "test-pepper")
	email := uniqueEmail()
	consumerID := seedConsumerWithEmail(t, pool, "ACTIVE", email)

	code, err := svc.RequestPinResetOtp(ctx, consumerID, email, "")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	token, err := svc.VerifyPinResetOtp(ctx, consumerID, code)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	// The OTP and the grant are different values (the OTP is not the reset token).
	if token == code {
		t.Fatal("the reset grant must not equal the OTP")
	}
	// A second pending grant, to prove ConsumePinResetGrant burns the rest. Age the first
	// reset code past the 60s resend cooldown so the second request is allowed.
	if _, err := pool.Exec(ctx, `UPDATE consumer_email_otps SET created_at = now() - interval '90 seconds' WHERE consumer_id=$1 AND purpose='PIN_RESET'`, consumerID); err != nil {
		t.Fatal(err)
	}
	code2, _ := svc.RequestPinResetOtp(ctx, consumerID, email, "")
	token2, err := svc.VerifyPinResetOtp(ctx, consumerID, code2)
	if err != nil {
		t.Fatal(err)
	}

	gotID, err := svc.ConsumePinResetGrant(ctx, token)
	if err != nil || gotID != consumerID {
		t.Fatalf("consume grant = %q %v, want %q", gotID, err, consumerID)
	}
	// Single-use: the same grant cannot be consumed twice.
	if _, err := svc.ConsumePinResetGrant(ctx, token); !errors.Is(err, ErrGrantInvalid) {
		t.Fatalf("a consumed reset grant must not be reusable, got %v", err)
	}
	// The other pending grant was burned by the first consume.
	if _, err := svc.ConsumePinResetGrant(ctx, token2); !errors.Is(err, ErrGrantInvalid) {
		t.Fatalf("a sibling pending grant must be burned, got %v", err)
	}
}

func TestLookupResetTarget_OnlyEligibleAccounts(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	creds := NewCredentialStore(pool)

	// ACTIVE + verified email ⇒ eligible.
	email := uniqueEmail()
	activeID := seedConsumerWithEmail(t, pool, "ACTIVE", email)
	activeHandle := handleOf(t, pool, activeID)
	if tgt, err := creds.LookupResetTarget(ctx, activeHandle); err != nil || !tgt.Eligible || tgt.ConsumerID != activeID {
		t.Fatalf("active+email should be eligible, got %+v %v", tgt, err)
	}

	// SUSPENDED ⇒ not eligible (no revival via reset).
	suspID := seedConsumerWithEmail(t, pool, "SUSPENDED", uniqueEmail())
	if tgt, err := creds.LookupResetTarget(ctx, handleOf(t, pool, suspID)); err != nil || tgt.Eligible {
		t.Fatalf("suspended must not be eligible, got %+v %v", tgt, err)
	}

	// CLOSED ⇒ not eligible.
	closedID := seedConsumerWithEmail(t, pool, "CLOSED", uniqueEmail())
	if tgt, err := creds.LookupResetTarget(ctx, handleOf(t, pool, closedID)); err != nil || tgt.Eligible {
		t.Fatalf("closed must not be eligible, got %+v %v", tgt, err)
	}

	// ACTIVE but NO email ⇒ not eligible (cannot receive a code).
	noEmailID := seedConsumerWithEmail(t, pool, "ACTIVE", "")
	if tgt, err := creds.LookupResetTarget(ctx, handleOf(t, pool, noEmailID)); err != nil || tgt.Eligible {
		t.Fatalf("active without email must not be eligible, got %+v %v", tgt, err)
	}

	// Unknown handle ⇒ zero, no error (anti-enumeration).
	if tgt, err := creds.LookupResetTarget(ctx, "nosuchhandle"); err != nil || tgt.Eligible {
		t.Fatalf("unknown handle must be a non-error zero, got %+v %v", tgt, err)
	}
}

func TestOtpIssuePolicy_PersistentCooldownAndWindowCap(t *testing.T) {
	pool := recoveryPoolOrSkip(t)
	ctx := context.Background()
	svc := NewConsumerRecoveryService(pool, "test-pepper")
	email := uniqueEmail()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM consumer_email_otps WHERE lower(email)=lower($1)`, email) })

	// First request works; an immediate second is refused by the resend cooldown.
	if _, err := svc.RequestSignupOtp(ctx, email, ""); err != nil {
		t.Fatalf("first request: %v", err)
	}
	if _, err := svc.RequestSignupOtp(ctx, email, ""); !errors.Is(err, ErrOtpCooldown) {
		t.Fatalf("immediate resend should hit the cooldown, got %v", err)
	}

	// Age the rows past the cooldown but keep them inside the window, and top up
	// to the per-window cap; the next request is refused as too many.
	if _, err := pool.Exec(ctx,
		`UPDATE consumer_email_otps SET created_at = now() - interval '2 minutes' WHERE lower(email)=lower($1)`, email); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < recoveryMaxPerWindow-1; i++ {
		// Inserted CONSUMED: the window cap counts rows consumed-or-not (checkIssuePolicy),
		// but the consumer_email_otps_live_signup_idx allows only ONE live (unconsumed)
		// SIGNUP_VERIFY per email, so topping up the window must use consumed rows.
		if _, err := pool.Exec(ctx,
			`INSERT INTO consumer_email_otps (id, purpose, email, code_hash, expires_at, created_at, consumed_at)
			 VALUES ($1,'SIGNUP_VERIFY',$2,'x', now()+interval '10 min', now()-interval '2 minutes', now()-interval '90 seconds')`,
			uuid.NewString(), email); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.RequestSignupOtp(ctx, email, ""); !errors.Is(err, ErrOtpTooMany) {
		t.Fatalf("exceeding the window cap should be refused, got %v", err)
	}
}

func handleOf(t *testing.T, pool *pgxpool.Pool, consumerID string) string {
	t.Helper()
	var h string
	if err := pool.QueryRow(context.Background(), `SELECT handle FROM public_api_credentials WHERE consumer_id=$1`, consumerID).Scan(&h); err != nil {
		t.Fatal(err)
	}
	return h
}
