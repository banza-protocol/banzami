package service

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The operator's proof drawer reads what the operation WAS — operation_kind,
// channel, funding_source — exactly as the public verifier does. Real database.
func TestProofAdmin_ReturnsOperationSemantics(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed proofs test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var has bool
	_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns
		WHERE table_name='transaction_proofs' AND column_name='operation_kind')`).Scan(&has)
	if !has {
		t.Skip("transaction_proofs has no semantics columns (0125) — skipping")
	}

	// Runtime values, not BZM-shaped: they can never be a real proof.
	withSem, legacy := "TEST-"+uuid.NewString(), "TEST-"+uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE proof_reference = ANY($1)`, []string{withSem, legacy})
	})
	if _, err := pool.Exec(ctx, `INSERT INTO transaction_proofs
		(proof_reference, transaction_id, environment, amount_minor, currency, status, operation_kind, channel, funding_source, method)
		VALUES ($1, $2, 'SANDBOX', 200000, 'AOA', 'CONFIRMED', 'PAYMENT', 'PAYMENT_LINK', 'BANZAMI_BALANCE', 'Saldo Banzami')`,
		withSem, uuid.NewString()); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO transaction_proofs
		(proof_reference, transaction_id, environment, amount_minor, currency, status, method)
		VALUES ($1, $2, 'SANDBOX', 100, 'AOA', 'CONFIRMED', 'Carteira')`, legacy, uuid.NewString()); err != nil {
		t.Fatalf("seed legacy: %v", err)
	}

	svc := NewProofAdminService(pool)
	list, err := svc.List(ctx, strings.TrimPrefix(withSem, "TEST-"), 10)
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v (%d rows)", err, len(list))
	}
	p := list[0]
	if p.OperationKind != "PAYMENT" || p.Channel != "PAYMENT_LINK" || p.FundingSource != "BANZAMI_BALANCE" {
		t.Fatalf("semantics = %q/%q/%q, want PAYMENT/PAYMENT_LINK/BANZAMI_BALANCE", p.OperationKind, p.Channel, p.FundingSource)
	}

	old, err := svc.List(ctx, strings.TrimPrefix(legacy, "TEST-"), 10)
	if err != nil || len(old) != 1 {
		t.Fatalf("list legacy: %v (%d rows)", err, len(old))
	}
	if old[0].OperationKind != "" || old[0].Channel != "" || old[0].Method != "Carteira" {
		t.Fatalf("a legacy proof reads as legacy (method only): %+v", old[0])
	}
}
