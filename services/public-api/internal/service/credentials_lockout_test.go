package service

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// PIN brute-force escalation (§G/H): 3 wrong PINs → a 1-minute credential lock
// (even the correct PIN waits); a further 3 wrong PINs → PIN_RECOVERY_REQUIRED,
// which time never clears and the correct PIN never bypasses. consumers.status
// stays ACTIVE throughout — the escalation is on the credential, not the
// lifecycle. Racing guesses cannot slip past the threshold.
func TestVerify_PinEscalationLockThenRecoveryRequired(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed credential test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // not defer: Cleanups run after defers, and a closed pool made every cleanup a silent no-op

	seed := func() (string, string) {
		id := uuid.NewString()
		handle := "lk" + id[:8]
		if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`, id, handle); err != nil {
			t.Fatal(err)
		}
		h, _ := bcrypt.GenerateFromPassword([]byte("246810"), bcrypt.MinCost)
		if _, err := pool.Exec(ctx, `INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`, id, handle, string(h)); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id = $1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id = $1`, id)
		})
		return id, handle
	}
	store := &CredentialStore{pool: pool}
	expireLock := func(handle string) {
		// Simulate the 1-minute lock elapsing without a successful login.
		if _, err := pool.Exec(ctx, `UPDATE public_api_credentials SET locked_until = now() - interval '1 second' WHERE handle = $1`, handle); err != nil {
			t.Fatal(err)
		}
	}
	statusOf := func(id string) string {
		var s string
		_ = pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id = $1`, id).Scan(&s)
		return s
	}

	const trusted = "trusted-device-1"

	// First two wrong PINs: refused, not locked.
	id, h1 := seed()
	// Make this device trusted for the account: a successful sign-in records it.
	// Persistent recovery-required may only ever be reached from a trusted device.
	if _, _, err := store.VerifyWithDevice(ctx, h1, "246810", trusted); err != nil {
		t.Fatalf("precondition: a correct PIN should sign in and record the device, got %v", err)
	}
	for i := 0; i < firstLockThreshold-1; i++ {
		if _, _, err := store.VerifyWithDevice(ctx, h1, "000000", trusted); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("wrong PIN %d should be a plain refusal, got %v", i, err)
		}
	}
	// Third wrong PIN trips the first lock — the correct PIN now waits.
	if _, _, err := store.VerifyWithDevice(ctx, h1, "000000", trusted); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("the threshold wrong PIN should still read as invalid, got %v", err)
	}
	if _, _, err := store.VerifyWithDevice(ctx, h1, "246810", trusted); !errors.Is(err, ErrCredentialsLocked) {
		t.Fatalf("the correct PIN during the first lock must be refused as locked, got %v", err)
	}
	if statusOf(id) != "ACTIVE" {
		t.Fatal("a locked credential must not change the consumer lifecycle")
	}

	// The lock elapses; a second run of 3 wrong PINs from the TRUSTED device
	// escalates to recovery-required.
	expireLock(h1)
	for i := 0; i < firstLockThreshold; i++ {
		_, _, _ = store.VerifyWithDevice(ctx, h1, "000000", trusted)
		// A lock may be re-applied mid-run; clear it so the sequence can continue.
		expireLock(h1)
	}
	// Now PIN login is disabled regardless of time or the correct PIN.
	if _, _, err := store.VerifyWithDevice(ctx, h1, "246810", trusted); !errors.Is(err, ErrPinRecoveryRequired) {
		t.Fatalf("after the second run the account must require recovery, got %v", err)
	}
	// Time passing (any residual lock cleared) does not lift it.
	expireLock(h1)
	if _, _, err := store.Verify(ctx, h1, "246810"); !errors.Is(err, ErrPinRecoveryRequired) {
		t.Fatalf("recovery-required must not be cleared by time, got %v", err)
	}
	if statusOf(id) != "ACTIVE" {
		t.Fatal("recovery-required must not change the consumer lifecycle")
	}
	// A completed recovery (UpdatePin) clears everything and restores login.
	if err := store.UpdatePin(ctx, id, "135790"); err != nil {
		t.Fatalf("recovery (UpdatePin) should clear the escalation, got %v", err)
	}
	if _, _, err := store.Verify(ctx, h1, "135790"); err != nil {
		t.Fatalf("after recovery the new PIN should sign in, got %v", err)
	}

	// Concurrency on a TRUSTED device: 50 simultaneous wrong guesses cannot slip
	// past the threshold — at the threshold the credential locks and the rest are
	// refused as locked.
	id2, h2 := seed()
	if _, _, err := store.VerifyWithDevice(ctx, h2, "246810", trusted); err != nil {
		t.Fatalf("precondition: trust the device, got %v", err)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; _, _, _ = store.VerifyWithDevice(ctx, h2, "000000", trusted) }()
	}
	close(start)
	wg.Wait()
	var lockCount int
	_ = pool.QueryRow(ctx, `SELECT lock_count FROM public_api_credentials WHERE handle = $1`, h2).Scan(&lockCount)
	if lockCount < 1 {
		t.Fatalf("a burst from a trusted device should have locked the credential, lock_count=%d", lockCount)
	}
	if statusOf(id2) != "ACTIVE" {
		t.Fatal("a burst must not change the consumer lifecycle")
	}

	// Anti-DoS: an UNKNOWN device never touches the GLOBAL credential state at all
	// — no failed_attempts, no lock, no recovery-required — so knowing a public
	// @banza cannot lock out or hold down the victim. (The untrusted throttle,
	// tested at the handler layer, is what bounds the unknown source.)
	id3, h3 := seed()
	for i := 0; i < firstLockThreshold*4; i++ {
		if _, _, err := store.VerifyWithDevice(ctx, h3, "000000", "attacker-device-unknown"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("an unknown wrong PIN should be a plain refusal, got %v", err)
		}
	}
	var (
		fa, lc int
		lu, rr *time.Time
	)
	_ = pool.QueryRow(ctx,
		`SELECT failed_attempts, lock_count, locked_until, pin_recovery_required_at
		   FROM public_api_credentials WHERE handle = $1`, h3).Scan(&fa, &lc, &lu, &rr)
	if fa != 0 || lc != 0 || lu != nil || rr != nil {
		t.Fatalf("an unknown device must not mutate global credential state, got fa=%d lc=%d lu=%v rr=%v", fa, lc, lu, rr)
	}
	if statusOf(id3) != "ACTIVE" {
		t.Fatal("status must remain ACTIVE for an attacked account")
	}
}

// A suspended consumer's right PIN opened a 24-hour session, and nothing could
// end a session once issued. The right PIN now opens nothing for a consumer who
// is not ACTIVE, and a sign-out ends every token issued before it.
func TestSessions_SuspensionAndSignOutEndThem(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed session test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // not defer: Cleanups run after defers, and a closed pool made every cleanup a silent no-op
	id := uuid.NewString()
	handle := "ss" + id[:8]
	if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`, id, handle); err != nil {
		t.Fatal(err)
	}
	h, _ := bcrypt.GenerateFromPassword([]byte("246810"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, `INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`, id, handle, string(h)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id = $1`, id)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id = $1`, id)
	})
	store := NewCredentialStore(pool)

	_, v, err := store.Verify(ctx, handle, "246810")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := store.SessionValid(ctx, id, v); err != nil || !ok {
		t.Fatalf("a fresh session is not valid: %v %v", ok, err)
	}
	if err := store.RevokeSessions(ctx, id); err != nil {
		t.Fatal(err)
	}
	if ok, _ := store.SessionValid(ctx, id, v); ok {
		t.Fatal("a token from before the sign-out is still valid")
	}

	if _, err := pool.Exec(ctx, `UPDATE consumers SET status = 'SUSPENDED' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Verify(ctx, handle, "246810"); !errors.Is(err, ErrConsumerNotActive) {
		t.Fatalf("a suspended consumer's right PIN was answered %v", err)
	}
	fresh := NewCredentialStore(pool) // no cached entry
	if ok, _ := fresh.SessionValid(ctx, id, v+1); ok {
		t.Fatal("a suspended consumer's current token is still valid")
	}
}

// ADR-060 §4. A test payer is a consumer with test value and no limit shared
// with the rest of the Sandbox; a session would let it pay any Business and send
// to any consumer. Its right PIN opens nothing, and a token it already holds is
// not a session.
func TestVerify_ATestPayerDoesNotSignIn(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed credential test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close) // not defer: Cleanups run after defers, and a closed pool made every cleanup a silent no-op
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.sandbox_test_payers')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("sandbox_test_payers not migrated in this DB — skipping")
	}
	seed := func(testPayer bool) string {
		id := uuid.NewString()
		handle := "tpc" + id[:8]
		if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status, display_name) VALUES ($1,$2,'ACTIVE',$2)`, id, handle); err != nil {
			t.Fatal(err)
		}
		h, _ := bcrypt.GenerateFromPassword([]byte("246810"), bcrypt.MinCost)
		if _, err := pool.Exec(ctx, `INSERT INTO public_api_credentials (consumer_id, handle, pin_hash) VALUES ($1,$2,$3)`, id, handle, string(h)); err != nil {
			t.Fatal(err)
		}
		if testPayer {
			if _, err := pool.Exec(ctx, `INSERT INTO sandbox_test_payers (consumer_id, project_id) VALUES ($1,$2)`, id, uuid.NewString()); err != nil {
				t.Fatal(err)
			}
		}
		t.Cleanup(func() {
			_, _ = pool.Exec(ctx, `DELETE FROM sandbox_test_payers WHERE consumer_id=$1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM public_api_credentials WHERE consumer_id=$1`, id)
			_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, id)
		})
		return handle
	}
	tp, person := seed(true), seed(false)

	confined := NewCredentialStore(pool)
	confined.ConfineTestPayers()
	if _, _, err := confined.Verify(ctx, tp, "246810"); !errors.Is(err, ErrTestPayerSignIn) {
		t.Fatalf("a test payer signed in: %v", err)
	}
	personID, version, err := confined.Verify(ctx, person, "246810")
	if err != nil {
		t.Fatalf("a person could not sign in: %v", err)
	}
	if ok, err := confined.SessionValid(ctx, personID, version); err != nil || !ok {
		t.Fatalf("a person's session: %v %v", ok, err)
	}

	// A token issued to the test payer before confinement.
	open := NewCredentialStore(pool)
	tpID, tpVersion, err := open.Verify(ctx, tp, "246810")
	if err != nil {
		t.Fatalf("unconfined store: %v", err)
	}
	if ok, _ := confined.SessionValid(ctx, tpID, tpVersion); ok {
		t.Fatal("a test payer's existing token is still a session")
	}
}
