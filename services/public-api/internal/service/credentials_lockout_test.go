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

// PIN policy: three wrong PINs on a TRUSTED device require PIN recovery. No
// temporary lock, no 3+3. The 1st/2nd failure report remaining 2/1; the 3rd sets
// PIN_RECOVERY_REQUIRED (persistent, recovery-only, even the correct PIN refused);
// a correct PIN before the third clears the counter. consumers.status stays ACTIVE
// throughout. An untrusted source never moves the global state, and racing guesses
// cannot slip a fourth attempt past the boundary.
func TestVerify_PinThreeFailuresRequireRecovery(t *testing.T) {
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
	statusOf := func(id string) string {
		var s string
		_ = pool.QueryRow(ctx, `SELECT status FROM consumers WHERE id = $1`, id).Scan(&s)
		return s
	}
	stateOf := func(handle string) (int, *time.Time) {
		var fa int
		var rr *time.Time
		_ = pool.QueryRow(ctx, `SELECT failed_attempts, pin_recovery_required_at FROM public_api_credentials WHERE handle = $1`, handle).Scan(&fa, &rr)
		return fa, rr
	}
	remaining := func(err error) int {
		var pe *PinAttemptError
		if errors.As(err, &pe) {
			return pe.Remaining
		}
		return -1
	}

	const trusted = "trusted-device-1"

	// ── 1/2/3 failures on a trusted device → remaining 2, 1, then recovery ──
	id, h1 := seed()
	if _, _, err := store.VerifyWithDevice(ctx, h1, "246810", trusted); err != nil {
		t.Fatalf("precondition: a correct PIN should sign in and record the device, got %v", err)
	}
	if _, _, err := store.VerifyWithDevice(ctx, h1, "000000", trusted); remaining(err) != 2 {
		t.Fatalf("wrong #1 should report remaining=2, got %d (%v)", remaining(err), err)
	}
	if _, _, err := store.VerifyWithDevice(ctx, h1, "000000", trusted); remaining(err) != 1 {
		t.Fatalf("wrong #2 should report remaining=1, got %d (%v)", remaining(err), err)
	}
	if _, _, err := store.VerifyWithDevice(ctx, h1, "000000", trusted); !errors.Is(err, ErrPinRecoveryRequired) {
		t.Fatalf("wrong #3 must require recovery, got %v", err)
	}
	// The correct old PIN is now refused — "I remembered it" cannot bypass recovery.
	if _, _, err := store.VerifyWithDevice(ctx, h1, "246810", trusted); !errors.Is(err, ErrPinRecoveryRequired) {
		t.Fatalf("the correct old PIN must be refused after recovery-required, got %v", err)
	}
	if statusOf(id) != "ACTIVE" {
		t.Fatal("recovery-required must not change the consumer lifecycle")
	}
	// A completed recovery (UpdatePin) clears the counter + the recovery state.
	if err := store.UpdatePin(ctx, id, "135790"); err != nil {
		t.Fatalf("recovery (UpdatePin) should clear the state, got %v", err)
	}
	if _, _, err := store.Verify(ctx, h1, "135790"); err != nil {
		t.Fatalf("after recovery the new PIN should sign in, got %v", err)
	}
	if fa, rr := stateOf(h1); fa != 0 || rr != nil {
		t.Fatalf("recovery did not clear the state: failed_attempts=%d recovery=%v", fa, rr)
	}

	// ── wrong, wrong, correct → success + the counter resets to zero ──
	id2, h2 := seed()
	if _, _, err := store.VerifyWithDevice(ctx, h2, "246810", trusted); err != nil {
		t.Fatalf("precondition: trust the device, got %v", err)
	}
	_, _, _ = store.VerifyWithDevice(ctx, h2, "000000", trusted)
	_, _, _ = store.VerifyWithDevice(ctx, h2, "000000", trusted)
	if _, _, err := store.VerifyWithDevice(ctx, h2, "246810", trusted); err != nil {
		t.Fatalf("a correct PIN before the third failure should sign in, got %v", err)
	}
	if fa, _ := stateOf(h2); fa != 0 {
		t.Fatalf("a correct PIN should reset failed_attempts to 0, got %d", fa)
	}
	_ = id2

	// ── Anti-DoS: an UNKNOWN device never moves the global state at all ──
	id3, h3 := seed()
	for i := 0; i < recoveryThreshold*4; i++ {
		if _, _, err := store.VerifyWithDevice(ctx, h3, "000000", "attacker-device-unknown"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("an unknown wrong PIN should be a plain refusal, got %v", err)
		}
	}
	if fa, rr := stateOf(h3); fa != 0 || rr != nil {
		t.Fatalf("an unknown device must not mutate global state, got failed_attempts=%d recovery=%v", fa, rr)
	}
	if statusOf(id3) != "ACTIVE" {
		t.Fatal("status must remain ACTIVE for an attacked account")
	}

	// ── Concurrency: 50 simultaneous wrong guesses on a trusted device reach
	// recovery-required exactly, never a fourth attempt, lifecycle unchanged. ──
	id4, h4 := seed()
	if _, _, err := store.VerifyWithDevice(ctx, h4, "246810", trusted); err != nil {
		t.Fatalf("precondition: trust the device, got %v", err)
	}
	var wg sync.WaitGroup
	startCh := make(chan struct{})
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-startCh; _, _, _ = store.VerifyWithDevice(ctx, h4, "000000", trusted) }()
	}
	close(startCh)
	wg.Wait()
	if fa, rr := stateOf(h4); fa != recoveryThreshold || rr == nil {
		t.Fatalf("a trusted burst must stop exactly at recovery-required, got failed_attempts=%d recovery=%v", fa, rr)
	}
	if _, _, err := store.VerifyWithDevice(ctx, h4, "246810", trusted); !errors.Is(err, ErrPinRecoveryRequired) {
		t.Fatalf("after the burst the account must require recovery, got %v", err)
	}
	if statusOf(id4) != "ACTIVE" {
		t.Fatal("a burst must not change the consumer lifecycle")
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
