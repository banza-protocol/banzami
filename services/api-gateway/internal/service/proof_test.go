package service

import (
	"context"
	"errors"
	"os"
	"regexp"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func proofPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed proof test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.transaction_proofs')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("transaction_proofs not migrated — skipping")
	}
	return pool
}

// SECURE_V1: six groups, 120 bits. The two-group shape this used to assert is
// now the LEGACY_HEX_V0 compatibility class and must never be minted.
var refRe = regexp.MustCompile(`^BZM(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$`)

func TestProof_EnsureIdempotentHashAndPublic(t *testing.T) {
	ctx := context.Background()
	pool := proofPoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewProofService(pool, "test-key", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")

	txn := uuid.NewString()
	confirmed := time.Now().UTC().Truncate(time.Second)
	in := ProofInput{
		TransactionID: txn, Environment: "SANDBOX",
		PayerSubjectType: "consumer", PayerSubjectID: uuid.NewString(), PayerHandle: "joao", PayerDisplayName: "João",
		PayeeSubjectType: "merchant", PayeeSubjectID: uuid.NewString(), PayeeHandle: "loja", PayeeDisplayName: "Loja ABC",
		AmountMinor: 2500000, Currency: "AOA", Status: "CONFIRMED",
		Method: "QR", LedgerReference: txn, ConfirmedAt: &confirmed,
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn) })

	// Idempotent: two Ensure calls yield the same proof (same reference, one row).
	p1, err := svc.Ensure(ctx, in)
	if err != nil {
		t.Fatalf("ensure1: %v", err)
	}
	p2, err := svc.Ensure(ctx, in)
	if err != nil {
		t.Fatalf("ensure2: %v", err)
	}
	if p1.ProofReference != p2.ProofReference {
		t.Fatalf("not idempotent: %s vs %s", p1.ProofReference, p2.ProofReference)
	}
	if !refRe.MatchString(p1.ProofReference) {
		t.Fatalf("reference not in SECURE_V1 six-group form: %q", p1.ProofReference)
	}
	if p1.ProofHash == "" || len(p1.ProofHash) != 64 {
		t.Fatalf("proof hash missing/short: %q", p1.ProofHash)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM transaction_proofs WHERE transaction_id=$1`, txn).Scan(&n)
	if n != 1 {
		t.Fatalf("expected exactly one proof row, got %d", n)
	}

	// Deterministic hash: a fresh service hashing the same canonical input matches.
	gotHash, _, _ := svc.hashAndSign(p1.ProofReference, in)
	if gotHash != p1.ProofHash {
		t.Fatalf("hash not deterministic: %s vs %s", gotHash, p1.ProofHash)
	}

	// Lookup by reference + verification recording bumps the counter.
	got, err := svc.GetByReference(ctx, p1.ProofReference)
	if err != nil {
		t.Fatalf("get by ref: %v", err)
	}
	svc.RecordVerification(ctx, got.ID, "iphash", "uahash", "")
	after, _ := svc.GetByReference(ctx, p1.ProofReference)
	if after.VerificationCount != got.VerificationCount+1 {
		t.Fatalf("verification count not incremented: %d -> %d", got.VerificationCount, after.VerificationCount)
	}

	// Public payload exposes only safe fields — no internal ids/ledger/signature.
	pub := svc.Public(got)
	for _, forbidden := range []string{"payer_subject_id", "payee_subject_id", "ledger_reference", "signature", "signature_value", "transaction_id", "id", "environment"} {
		if _, ok := pub[forbidden]; ok {
			t.Fatalf("public payload leaked %q", forbidden)
		}
	}
	if pub["amount"] != int64(2500000) || pub["payer_handle"] != "joao" || pub["operator"] != "banzami" {
		t.Fatalf("public payload wrong: %+v", pub)
	}

	// Unknown reference → not found.
	if _, err := svc.GetByReference(ctx, "BZM-ZZZZ-ZZZZ"); !errors.Is(err, ErrProofNotFound) {
		t.Fatalf("unknown ref: want ErrProofNotFound, got %v", err)
	}
}

// Audit Part 7 / bug #2: a reversed transaction must not keep showing a green
// "verified" proof. Exercises the lazy re-sync (Ensure), the explicit MarkReversed
// hook, idempotency, and the monotonic no-downgrade guarantee.
func TestProof_ReversalLifecycle(t *testing.T) {
	ctx := context.Background()
	pool := proofPoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewProofService(pool, "test-key", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")

	confirmed := time.Now().UTC().Truncate(time.Second)
	mkInput := func(txn, status string) ProofInput {
		return ProofInput{
			TransactionID: txn, Environment: "SANDBOX",
			PayerSubjectType: "consumer", PayerSubjectID: uuid.NewString(), PayerHandle: "joao",
			PayeeSubjectType: "consumer", PayeeSubjectID: uuid.NewString(), PayeeHandle: "ana",
			AmountMinor: 1000, Currency: "AOA", Status: status,
			Method: "Transfer", LedgerReference: txn, ConfirmedAt: &confirmed,
		}
	}

	t.Run("Ensure re-syncs an existing CONFIRMED proof to REVERSED", func(t *testing.T) {
		txn := uuid.NewString()
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn) })

		p1, err := svc.Ensure(ctx, mkInput(txn, "COMPLETED"))
		if err != nil {
			t.Fatalf("ensure confirmed: %v", err)
		}
		if p1.Status != "CONFIRMED" || p1.ReversedAt != nil {
			t.Fatalf("want CONFIRMED/no reversed_at, got %s/%v", p1.Status, p1.ReversedAt)
		}
		// Record a verification so we can prove the count survives the transition.
		svc.RecordVerification(ctx, p1.ID, "ip", "ua", "")

		p2, err := svc.Ensure(ctx, mkInput(txn, "REFUNDED")) // REFUNDED → REVERSED
		if err != nil {
			t.Fatalf("ensure reversed: %v", err)
		}
		if p2.ProofReference != p1.ProofReference {
			t.Fatalf("reference changed on re-sync: %s -> %s", p1.ProofReference, p2.ProofReference)
		}
		if p2.Status != "REVERSED" {
			t.Fatalf("status not re-synced: got %s", p2.Status)
		}
		if p2.ReversedAt == nil {
			t.Fatal("reversed_at not stamped")
		}
		if p2.VerificationCount != 1 {
			t.Fatalf("verification_count not preserved across reversal: got %d", p2.VerificationCount)
		}
	})

	t.Run("REVERSED is never downgraded back to CONFIRMED", func(t *testing.T) {
		txn := uuid.NewString()
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn) })

		if _, err := svc.Ensure(ctx, mkInput(txn, "REVERSED")); err != nil {
			t.Fatalf("ensure reversed: %v", err)
		}
		// A later (stale) Ensure with a positive status must NOT resurrect a green proof.
		p, err := svc.Ensure(ctx, mkInput(txn, "COMPLETED"))
		if err != nil {
			t.Fatalf("ensure confirmed-after-reversed: %v", err)
		}
		if p.Status != "REVERSED" {
			t.Fatalf("REVERSED was downgraded to %s", p.Status)
		}
	})

	t.Run("MarkReversed is idempotent and preserves the proof", func(t *testing.T) {
		txn := uuid.NewString()
		t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn) })

		p, err := svc.Ensure(ctx, mkInput(txn, "COMPLETED"))
		if err != nil {
			t.Fatalf("ensure: %v", err)
		}
		if err := svc.MarkReversed(ctx, txn, "SANDBOX"); err != nil {
			t.Fatalf("mark reversed: %v", err)
		}
		if err := svc.MarkReversed(ctx, txn, "SANDBOX"); err != nil { // idempotent
			t.Fatalf("mark reversed again: %v", err)
		}
		got, err := svc.GetByReference(ctx, p.ProofReference)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.Status != "REVERSED" || got.ReversedAt == nil {
			t.Fatalf("want REVERSED with reversed_at, got %s/%v", got.Status, got.ReversedAt)
		}
		var n int
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM transaction_proofs WHERE transaction_id=$1`, txn).Scan(&n)
		if n != 1 {
			t.Fatalf("proof row count changed: %d", n)
		}
	})

	t.Run("MarkReversed is a safe no-op when no proof exists", func(t *testing.T) {
		if err := svc.MarkReversed(ctx, uuid.NewString(), "SANDBOX"); err != nil {
			t.Fatalf("no-op mark reversed errored: %v", err)
		}
	})
}

func TestStatusIsTerminalNegative(t *testing.T) {
	neg := []string{"REVERSED", "CANCELLED", "FAILED", "EXPIRED"}
	pos := []string{"CONFIRMED", "PENDING", ""}
	for _, s := range neg {
		if !statusIsTerminalNegative(s) {
			t.Errorf("%q should be terminal-negative", s)
		}
	}
	for _, s := range pos {
		if statusIsTerminalNegative(s) {
			t.Errorf("%q should NOT be terminal-negative", s)
		}
	}
}

func TestNormalizeProofStatus(t *testing.T) {
	cases := map[string]string{
		"COMPLETED": "CONFIRMED", "completed": "CONFIRMED", "CONFIRMED": "CONFIRMED",
		"CAPTURED": "CONFIRMED", "SUCCEEDED": "CONFIRMED", "": "CONFIRMED",
		"PENDING": "PENDING", "AUTHORIZED": "PENDING",
		"FAILED": "FAILED", "REVERSED": "REVERSED", "REFUNDED": "REVERSED",
		"CANCELLED": "CANCELLED", "EXPIRED": "EXPIRED", "weird": "CONFIRMED",
	}
	for in, want := range cases {
		if got := normalizeProofStatus(in); got != want {
			t.Errorf("normalizeProofStatus(%q)=%q want %q", in, got, want)
		}
	}
}
