package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// A5-01. Starting a factor replacement used to discard the confirmed factor.
// An operator who started one and closed the tab left an account that behaved
// as never-enrolled: the password alone reached enrolment, and enrolment ended
// in a session. The confirmed factor now guards every login until a code from
// the NEW authenticator is proven, and only then is it swapped.
func TestMFAReplacement_TheOldFactorGuardsUntilTheNewOneIsProven(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed MFA test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role) VALUES ($1, $2, 'MFA replace', 'SUPER_ADMIN')`, id, id+"@test"); err != nil {
		t.Fatalf("seed operator: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM admin_users WHERE id = $1`, id) //nolint:errcheck

	svc := NewMFAService(pool, nil)
	oldSeed, _, err := svc.BeginEnrolment(ctx, id, id+"@test")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix() / 30
	code := func(seed string, step int64) string {
		c, err := auth.TOTPCodeAt(seed, step)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	if _, err := svc.ConfirmEnrolment(ctx, id, code(oldSeed, now-1)); err != nil {
		t.Fatalf("first enrolment: %v", err)
	}

	newSeed, _, err := svc.BeginReplacement(ctx, id, id+"@test")
	if err != nil {
		t.Fatal(err)
	}

	// Abandoned here. The account is still enrolled — login answers with a
	// challenge, not an enrolment token — and a first-time enrolment is refused.
	if st, _ := svc.Status(ctx, id); !st.Enrolled {
		t.Fatal("starting a replacement left the account without a confirmed factor")
	}
	if _, _, err := svc.BeginEnrolment(ctx, id, id+"@test"); err == nil {
		t.Fatal("a password-only enrolment was allowed mid-replacement")
	}
	// The pending seed opens nothing; the old factor still does.
	if err := svc.Verify(ctx, id, code(newSeed, now)); !errors.Is(err, ErrMFACodeRejected) {
		t.Fatalf("an unconfirmed replacement seed passed a login (err=%v)", err)
	}
	if err := svc.Verify(ctx, id, code(oldSeed, now)); err != nil {
		t.Fatalf("the confirmed factor stopped working mid-replacement: %v", err)
	}

	// Confirming needs the NEW authenticator.
	if _, err := svc.ConfirmEnrolment(ctx, id, code(oldSeed, now+1)); !errors.Is(err, ErrMFACodeRejected) {
		t.Fatalf("the old factor confirmed its own replacement (err=%v)", err)
	}
	if _, err := svc.ConfirmEnrolment(ctx, id, code(newSeed, now+1)); err != nil {
		t.Fatalf("confirming the new authenticator: %v", err)
	}
	if err := svc.Verify(ctx, id, code(oldSeed, now+1)); !errors.Is(err, ErrMFACodeRejected) {
		t.Fatal("the replaced factor still opens the account")
	}

	// Nothing pending now: a stray confirmation has nothing to prove.
	if _, err := svc.ConfirmEnrolment(ctx, id, code(newSeed, now+1)); !errors.Is(err, ErrMFANothingToConfirm) {
		t.Fatalf("want ErrMFANothingToConfirm, got %v", err)
	}
}

// A refused TOTP guess is not a reason to run ten bcrypt comparisons.
func TestMFARecoveryCode_OnlyItsShapeReachesBcrypt(t *testing.T) {
	for _, c := range []string{"123456", "", "abcde-fghjk-", "ABCDE-FGHJK0", "abcdefghjk"} {
		if recoveryCodeShape.MatchString(c) {
			t.Fatalf("%q was treated as a recovery code", c)
		}
	}
	for i := 0; i < 50; i++ {
		c, err := newRecoveryCode()
		if err != nil {
			t.Fatal(err)
		}
		if !recoveryCodeShape.MatchString(c) {
			t.Fatalf("a real recovery code %q was refused by its own shape", c)
		}
	}
}
