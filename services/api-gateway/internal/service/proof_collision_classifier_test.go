// Which unique violation may be retried is a security-relevant decision, and the
// DB-backed tests cannot prove it.
//
// Retrying a proof_reference collision is correct: the reference was never ours,
// so mint another. Retrying a (transaction_id, environment) collision would be
// wrong in a way no integration test can surface — ON CONFLICT absorbs that race
// before it ever reaches the error path, so an implementation that retried
// everything passes the integration suite while being wrong about the one case
// that matters. If ON CONFLICT were ever removed or the index renamed, a blanket
// retry would spin minting fresh references for a transaction that already has a
// proof, and only bounded-attempts would stop it.
//
// So the classifier is tested directly, on synthetic driver errors.
package service

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func uniqueViolation(constraint string) error {
	return &pgconn.PgError{Code: "23505", ConstraintName: constraint}
}

func TestProofReferenceCollisionClassifier(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"the public reference index is retryable",
			uniqueViolation("transaction_proofs_proof_reference_key"), true},
		{"wrapped, still retryable",
			fmt.Errorf("insert proof: %w", uniqueViolation("transaction_proofs_proof_reference_key")), true},

		// The one the integration tests cannot reach.
		{"the transaction/environment index is NOT retryable",
			uniqueViolation("transaction_proofs_txn_idx"), false},
		{"a differently named transaction/environment index is NOT retryable",
			uniqueViolation("transaction_proofs_transaction_id_environment_key"), false},

		{"an unrelated unique index is NOT retryable",
			uniqueViolation("wallets_merchant_id_currency_key"), false},
		{"a unique violation with no constraint metadata is NOT retryable",
			uniqueViolation(""), false},
		{"a non-unique database error is NOT retryable",
			&pgconn.PgError{Code: "23503", ConstraintName: "transaction_proofs_proof_reference_key"}, false},
		{"a plain error is NOT retryable", errors.New("connection reset"), false},
		{"nil is NOT retryable", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := proofReferenceCollision(tc.err); got != tc.want {
				t.Fatalf("proofReferenceCollision(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
