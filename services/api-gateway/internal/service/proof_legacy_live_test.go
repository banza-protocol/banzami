// LEGACY_HEX_V0 is a bounded Sandbox compatibility class, and lookup authority is
// where that has to be enforced.
//
// Two properties, both proven against a real database because both are decided by
// the query path rather than by any caller:
//
//   - a legacy reference never yields a LIVE proof, even if a LIVE row of that
//     shape exists. The rule cannot rest on "Financial LIVE does not exist yet".
//   - a non-canonical spelling is not a reference. The SQL matches case-
//     insensitively, so without the gate one proof would answer to many
//     spellings, and a limiter keyed on the reference could be evaded by
//     rotating case.
package service

import (
	"context"
	"errors"
	"testing"
)

func seedProof(t *testing.T, svc *ProofService, txn, env string, ref string) {
	t.Helper()
	svc.newReference = func() (string, error) { return ref, nil }
	in := proofInput(txn)
	in.Environment = env
	if _, err := svc.Ensure(context.Background(), in); err != nil {
		t.Fatalf("seed %s/%s: %v", ref, env, err)
	}
}

func TestGetByReference_LegacyIsSandboxOnly(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	const (
		sandboxRef = "BZM-A1B2-C3D4" // legacy shape, hex only
		liveRef    = "BZM-E5F6-0789"
	)
	sandboxTxn := "legacy-sandbox-" + t.Name()
	liveTxn := "legacy-live-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id = ANY($1)`,
			[]string{sandboxTxn, liveTxn})
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE proof_reference = ANY($1)`,
		[]string{sandboxRef, liveRef})

	seedProof(t, svc, sandboxTxn, "SANDBOX", sandboxRef)
	seedProof(t, svc, liveTxn, "LIVE", liveRef)

	// The compatibility case still works — this is why the class exists at all.
	got, err := svc.GetByReference(ctx, sandboxRef)
	if err != nil {
		t.Fatalf("a legacy SANDBOX proof must still verify: %v", err)
	}
	if got.ProofReference != sandboxRef {
		t.Fatalf("want %s, got %s", sandboxRef, got.ProofReference)
	}

	// A LIVE row of legacy shape must be unreachable, and must be refused the same
	// way an unknown reference is: probing LIVE must not reveal that the row exists.
	if _, err := svc.GetByReference(ctx, liveRef); !errors.Is(err, ErrProofNotFound) {
		t.Fatalf("a LEGACY_HEX_V0 reference must never resolve in LIVE, got err=%v", err)
	}
}

func TestGetByReference_SecureV1WorksInBothEnvironments(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	// 120-bit references are not the bounded compatibility class, so LIVE is fine.
	const liveRef = "BZM-ABCD-2345-6789-JKMN-PQRS-TVWX"
	txn := "securev1-live-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn)
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE proof_reference=$1`, liveRef)

	seedProof(t, svc, txn, "LIVE", liveRef)
	if _, err := svc.GetByReference(ctx, liveRef); err != nil {
		t.Fatalf("SECURE_V1 must resolve in LIVE: %v", err)
	}
}

// One proof, one spelling. The SQL is case-insensitive; the gate is what stops a
// reference having several identities.
func TestGetByReference_RejectsNonCanonicalSpelling(t *testing.T) {
	pool, svc := proofFixture(t)
	ctx := context.Background()

	const ref = "BZM-9F8E-7D6C"
	txn := "spelling-" + t.Name()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE transaction_id=$1`, txn)
	})
	_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE proof_reference=$1`, ref)
	seedProof(t, svc, txn, "SANDBOX", ref)

	if _, err := svc.GetByReference(ctx, ref); err != nil {
		t.Fatalf("the canonical spelling must resolve: %v", err)
	}
	for _, variant := range []string{
		"bzm-9f8e-7d6c", // lower
		"Bzm-9F8e-7D6c", // mixed
		" BZM-9F8E-7D6C",
		"BZM-9F8E-7D6C ",
		"BZM9F8E7D6C",
		"BZM-9F8E-7D6C-",
	} {
		if _, err := svc.GetByReference(ctx, variant); !errors.Is(err, ErrProofNotFound) {
			t.Fatalf("variant %q must not resolve to the same proof (err=%v)", variant, err)
		}
	}
}
