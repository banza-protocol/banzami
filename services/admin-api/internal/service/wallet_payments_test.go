package service

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func walletPaymentsPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed wallet payments test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.business_public_identities')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("business_public_identities not migrated (0125) — skipping")
	}
	return pool
}

// The received-payments list shows the payee as receipts do (the Business's
// @handle and public name, not the raw account name) and the operation's
// existing proof — the transfer's, the one reference every receipt carries —
// or nothing when no proof was issued. Real database, no mocks.
func TestWalletPaymentsList_PayeeIsPublicIdentity_ReferenceIsTheTransfersProof(t *testing.T) {
	ctx := context.Background()
	pool := walletPaymentsPoolOrSkip(ctx, t)
	defer pool.Close()

	m, c := uuid.NewString(), uuid.NewString()
	handle := "wp" + uuid.NewString()[:8]
	withProof, withoutProof := uuid.NewString(), uuid.NewString()
	transferA, transferB := uuid.NewString(), uuid.NewString()
	// Not a real reference: a runtime value that cannot collide with a stored proof
	// (and is not BZM-shaped, so it is never mistaken for one).
	ref := "TEST-" + uuid.NewString()
	// A second proof keyed on the WALLET PAYMENT id — what the Business's PDF used
	// to mint before one-operation-one-proof. It must not be the one shown.
	strayRef := "TEST-" + uuid.NewString()

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed: %v\n%s", err, sql)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM transaction_proofs WHERE proof_reference = ANY($1)`, []string{ref, strayRef})
		_, _ = pool.Exec(ctx, `DELETE FROM wallet_payments WHERE merchant_id = $1`, m)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle = $1`, handle)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id = $1`, c)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id = $1`, m)
	})

	exec(`INSERT INTO merchants (id, name, email, status) VALUES ($1, 'Sandbox · Loja-Projecto', $2, 'ACTIVE')`, m, m+"@test")
	exec(`INSERT INTO merchant_profiles (merchant_id, handle, display_name) VALUES ($1, $2, 'Loja Kiame')`, m, handle)
	exec(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1, 'MERCHANT', $2)`, handle, m)
	exec(`INSERT INTO consumers (id, handle, display_name) VALUES ($1, $2, 'Ana Paula')`, c, "c"+uuid.NewString()[:8])
	for _, wp := range []struct{ id, transfer string }{{withProof, transferA}, {withoutProof, transferB}} {
		exec(`INSERT INTO wallet_payments (id, transfer_id, merchant_id, consumer_id, amount_minor, currency, status, trace_id, environment)
		      VALUES ($1, $2, $3, $4, 200000, 'AOA', 'COMPLETED', $5, 'SANDBOX')`, wp.id, wp.transfer, m, c, "trace-"+wp.id)
	}
	exec(`INSERT INTO transaction_proofs (proof_reference, transaction_id, environment, amount_minor, currency, status)
	      VALUES ($1, $2, 'SANDBOX', 200000, 'AOA', 'CONFIRMED')`, ref, transferA)
	exec(`INSERT INTO transaction_proofs (proof_reference, transaction_id, environment, amount_minor, currency, status)
	      VALUES ($1, $2, 'SANDBOX', 200000, 'AOA', 'CONFIRMED')`, strayRef, withoutProof)

	items, _, err := NewPostgresWalletPaymentService(pool).List(ctx, AdminWalletPaymentFilter{MerchantID: m, Limit: 10})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d rows, want 2 (a join must not multiply rows)", len(items))
	}
	byID := map[string]AdminWalletPaymentItem{}
	for _, it := range items {
		byID[it.ID] = it
	}
	a, b := byID[withProof], byID[withoutProof]
	if a.PayeeHandle != handle || a.PayeeDisplayName != "Loja Kiame" {
		t.Errorf("payee = @%s · %q, want @%s · \"Loja Kiame\"", a.PayeeHandle, a.PayeeDisplayName, handle)
	}
	if a.MerchantName != "Sandbox · Loja-Projecto" {
		t.Errorf("merchant_name = %q, want the raw account name kept alongside", a.MerchantName)
	}
	if a.ProofReference != ref {
		t.Errorf("proof_reference = %q, want the transfer's proof", a.ProofReference)
	}
	if b.ProofReference != "" {
		t.Errorf("a payment whose transfer has no proof shows %q, want empty (a proof keyed on the wallet payment id is not the operation's)", b.ProofReference)
	}
	if a.PayerName != "Ana Paula" {
		t.Errorf("payer = %q", a.PayerName)
	}
}
