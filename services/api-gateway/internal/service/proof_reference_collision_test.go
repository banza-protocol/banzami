// Public proof references are unique in the database, and the code that mints
// them must survive the day that uniqueness actually bites.
//
// The insert says ON CONFLICT (transaction_id, environment) DO NOTHING, which
// converges concurrent callers for the SAME transaction. It says nothing about
// the UNIQUE index on proof_reference, so a collision there escaped as a raw
// constraint error with no second attempt. That was tolerable only while the
// namespace was empty; the historical backfill is about to register already-
// printed references into the very alphabet the generator draws from, so the two
// namespaces now genuinely overlap.
//
// These tests force the collision instead of waiting for a 1-in-2^40 accident.
// Skipped when DATABASE_URL is unset, matching the other DB-backed tests here.
package service

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func proofFixture(t *testing.T) (*pgxpool.Pool, *ProofService) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed proof tests")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool, NewProofService(pool, "test-signing-key", "test-key", "banzami", "banza", "https://banzami.com/r/")
}

func proofInput(txn string) ProofInput {
	return ProofInput{
		TransactionID: txn,
		Environment:   "SANDBOX",
		AmountMinor:   1000,
		Currency:      "AOA",
		Status:        "COMPLETED",
	}
}

// A colliding candidate must be abandoned for a fresh one — never reused, and
// never quietly bound to the transaction that already owns it.
func TestEnsure_RetriesOnPublicReferenceCollision(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	taken := "BZM-TEST-CO11"
	incumbentTxn := "collision-incumbent-" + t.Name()
	freshTxn := "collision-fresh-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id = ANY($1)`,
			[]string{incumbentTxn, freshTxn})
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id = ANY($1) OR proof_reference=$2`,
		[]string{incumbentTxn, freshTxn}, taken)

	// The incumbent owns the reference the generator is about to propose twice.
	svc.newReference = func() (string, error) { return taken, nil }
	incumbent, err := svc.Ensure(ctx, proofInput(incumbentTxn))
	if err != nil {
		t.Fatalf("seeding the incumbent proof: %v", err)
	}
	if incumbent.ProofReference != taken {
		t.Fatalf("incumbent should hold %s, got %s", taken, incumbent.ProofReference)
	}

	// Now a different transaction whose generator hands back the taken reference
	// twice before yielding a free one.
	want := "BZM-TEST-FREE"
	seq := []string{taken, taken, want}
	i := 0
	svc.newReference = func() (string, error) {
		r := seq[i]
		if i < len(seq)-1 {
			i++
		}
		return r, nil
	}
	got, err := svc.Ensure(ctx, proofInput(freshTxn))
	if err != nil {
		t.Fatalf("Ensure must retry past a reference collision, got: %v", err)
	}
	if got.ProofReference != want {
		t.Fatalf("want the first free reference %s, got %s", want, got.ProofReference)
	}
	if i < 2 {
		t.Fatalf("the collision path was never exercised (generator called %d extra times)", i)
	}

	// The incumbent must be untouched: same reference, still its own transaction.
	var refOwner string
	if err := pool.QueryRow(ctx,
		`SELECT transaction_id FROM transaction_proofs WHERE proof_reference=$1`, taken).Scan(&refOwner); err != nil {
		t.Fatalf("incumbent row vanished: %v", err)
	}
	if refOwner != incumbentTxn {
		t.Fatalf("collision rebound %s from %s to %s", taken, incumbentTxn, refOwner)
	}
}

// A generator that can only ever produce a taken reference must fail closed
// rather than spin, and must not fall back to some other reference scheme.
func TestEnsure_BoundedRetryFailsClosed(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	taken := "BZM-TEST-BND1"
	incumbentTxn := "bounded-incumbent-" + t.Name()
	doomedTxn := "bounded-doomed-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id = ANY($1)`,
			[]string{incumbentTxn, doomedTxn})
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id = ANY($1) OR proof_reference=$2`,
		[]string{incumbentTxn, doomedTxn}, taken)

	svc.newReference = func() (string, error) { return taken, nil }
	if _, err := svc.Ensure(ctx, proofInput(incumbentTxn)); err != nil {
		t.Fatalf("seeding: %v", err)
	}

	calls := 0
	svc.newReference = func() (string, error) { calls++; return taken, nil }
	if _, err := svc.Ensure(ctx, proofInput(doomedTxn)); err == nil {
		t.Fatal("a permanently colliding generator must fail closed, not succeed")
	}
	if calls != maxReferenceAttempts {
		t.Fatalf("want exactly %d bounded attempts, got %d", maxReferenceAttempts, calls)
	}
	// No proof may exist for the doomed transaction: failing closed means nothing
	// was written, not that something half-written is now publicly verifiable.
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM transaction_proofs WHERE transaction_id=$1`, doomedTxn).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("failed-closed Ensure still wrote %d proof row(s)", n)
	}
}

// §4: concurrent Ensure for the SAME transaction converges on ONE proof and one
// reference. Previously asserted only by reading the ON CONFLICT clause.
func TestEnsure_ConcurrentCallersConvergeOnOneProof(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	txn := "concurrent-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn)
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn)

	const callers = 8
	refs := make([]string, callers)
	errs := make([]error, callers)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start // release them together
			p, err := svc.Ensure(ctx, proofInput(txn))
			errs[i] = err
			if p != nil {
				refs[i] = p.ProofReference
			}
		}(i)
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("caller %d failed; the (transaction_id, environment) race must not leak: %v", i, err)
		}
	}
	for i, r := range refs {
		if r == "" || r != refs[0] {
			t.Fatalf("caller %d got %q, caller 0 got %q — one transaction, one reference", i, r, refs[0])
		}
	}
	var rows int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM transaction_proofs WHERE transaction_id=$1`, txn).Scan(&rows); err != nil {
		t.Fatalf("count: %v", err)
	}
	if rows != 1 {
		t.Fatalf("want exactly 1 proof row for the transaction, got %d", rows)
	}
}
