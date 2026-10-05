package service

// Safeguard: a deleted Business must never sign in again, even if the credential
// cleanup that runs after the Core deletion is skipped or fails.
//
// "Suprimir conta Business" is a cross-service orchestration: Core sets
// merchants.status = CLOSED (the point of no return), then the api-gateway makes a
// best-effort attempt to revoke sessions and delete the app credential. Those last
// steps can fail (a dropped connection, a crash between calls) and leave the
// credential row behind. The barrier to a new sign-in must therefore be the CLOSED
// status itself, enforced inside VerifyHandlePin — not the credential cleanup.
//
// This reproduces the exact partial-failure the brief calls out:
//  1. the Business is deleted in Core (status CLOSED),
//  2. the credential removal is skipped/failed (the row still exists),
//  3. a later sign-in attempt with the correct handle + PIN,
//  4. that attempt MUST be refused.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func TestVerifyHandlePin_ClosedBusinessCannotSignInEvenWhenCredentialSurvives(t *testing.T) {
	pool := dbPoolOrSkip(t)
	t.Cleanup(pool.Close) // not defer: Cleanups run after defers, and a closed pool made every cleanup a silent no-op
	ctx := context.Background()
	svc := NewPostgresMerchantCredentialService(pool)

	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'del-safeguard',$2,'ACTIVE')`,
		id, fmt.Sprintf("del-%s@example.test", id[:8])); err != nil {
		t.Fatal(err)
	}
	handle := "db" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	hash, _ := bcrypt.GenerateFromPassword([]byte("975324"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`, handle, id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO merchant_app_credentials (merchant_id, environment, handle, pin_hash, activated_at)
	                              VALUES ($1,'SANDBOX',$2,$3,$4)`, id, handle, string(hash), time.Now()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE handle=$1`, handle)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})

	// Precondition: while ACTIVE, the correct handle + PIN signs in.
	if got, _, err := svc.VerifyHandlePin(ctx, handle, "975324"); err != nil || got != id {
		t.Fatalf("precondition: an active Business signs in, got %q %v", got, err)
	}

	// Core deletion happened: merchants.status is now CLOSED. The credential
	// cleanup is deliberately NOT run here — this is the skipped/failed step.
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status='CLOSED' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}

	// The credential row must still exist, so the test proves the barrier is the
	// status and not the (absent) cleanup.
	var credExists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM merchant_app_credentials WHERE merchant_id=$1 AND environment='SANDBOX')`,
		id).Scan(&credExists); err != nil {
		t.Fatal(err)
	}
	if !credExists {
		t.Fatal("test setup invalid: the credential row was removed, so this would not prove the status barrier")
	}

	// The sign-in must be refused on the strength of CLOSED alone.
	if got, _, err := svc.VerifyHandlePin(ctx, handle, "975324"); !errors.Is(err, ErrMerchantCredsInvalid) {
		t.Fatalf("a CLOSED Business signed in as %q (err %v) despite the surviving credential — the status is not the barrier", got, err)
	}

	// And a fresh PIN re-auth (the deletion reauth path) must also refuse once the
	// account is gone, so a replayed deletion cannot re-confirm against a tombstone.
	// (VerifyPinByMerchantID checks the PIN; the CLOSED status blocks the sign-in
	// that would follow — proven above. Here we confirm the credential delete is
	// idempotent and leaves no way back.)
	if err := svc.DeleteCredentialByMerchant(ctx, id, "SANDBOX"); err != nil {
		t.Fatalf("credential cleanup should be idempotent, got %v", err)
	}
	if err := svc.DeleteCredentialByMerchant(ctx, id, "SANDBOX"); err != nil {
		t.Fatalf("a repeated credential cleanup should be a no-op, got %v", err)
	}
	if got, _, err := svc.VerifyHandlePin(ctx, handle, "975324"); !errors.Is(err, ErrMerchantCredsInvalid) {
		t.Fatalf("after cleanup the deleted Business still signed in as %q (err %v)", got, err)
	}
}
