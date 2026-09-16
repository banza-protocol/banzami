package service

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ADR-065 receive-point invariants, proven against a migrated ephemeral DB.
// Skipped when DATABASE_URL is unset (same convention as the other DB tests).
func rpPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed receive-point tests")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func seedMerchant(ctx context.Context, t *testing.T, pool *pgxpool.Pool, status string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := pool.Exec(ctx,
		`INSERT INTO merchants (id, name, email, status) VALUES ($1,$2,$3,$4)`,
		id, "Loja Teste", id+"@example.test", status)
	if err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	return id
}

func TestReceivePoint_ProvisionIsIdempotent(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m := seedMerchant(ctx, t, pool, "ACTIVE")

	a, err := svc.EnsureActive(ctx, m, "SANDBOX")
	if err != nil {
		t.Fatalf("ensure 1: %v", err)
	}
	b, err := svc.EnsureActive(ctx, m, "SANDBOX")
	if err != nil {
		t.Fatalf("ensure 2: %v", err)
	}
	if a.PublicSlug != b.PublicSlug {
		t.Fatalf("idempotent provisioning drifted: %q vs %q", a.PublicSlug, b.PublicSlug)
	}
	if len(a.PublicSlug) != receivePointSlugLen {
		t.Fatalf("slug entropy: want %d chars, got %d", receivePointSlugLen, len(a.PublicSlug))
	}
	// The slug never encodes the merchant id (RECEIVE_POINT_PREDICTABLE_IDS=0).
	if a.PublicSlug == m || len(a.PublicSlug) == 36 {
		t.Fatal("slug looks like a merchant id")
	}
}

func TestReceivePoint_ProvisionRaceKeepsOneActive(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m := seedMerchant(ctx, t, pool, "ACTIVE")

	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = svc.EnsureActive(ctx, m, "SANDBOX") }()
	}
	wg.Wait()

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM business_receive_points WHERE merchant_id=$1 AND environment='SANDBOX' AND status='ACTIVE'`,
		m).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("race created %d ACTIVE receive points, want exactly 1", n)
	}
}

func TestReceivePoint_ResolveIsReadOnlyAndPublic(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m := seedMerchant(ctx, t, pool, "ACTIVE")
	rp, err := svc.EnsureActive(ctx, m, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}

	pub, resolvedMerchant, err := svc.ResolveForPayment(ctx, rp.PublicSlug)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolvedMerchant != m {
		t.Fatalf("server must resolve the destination from the slug: got %q", resolvedMerchant)
	}
	if pub.DisplayName != "Loja Teste" || pub.Status != "ACTIVE" {
		t.Fatalf("public view wrong: %+v", pub)
	}
	// Resolve creates no session/ledger state — repeated resolves change nothing.
	for i := 0; i < 3; i++ {
		if _, _, err := svc.ResolveForPayment(ctx, rp.PublicSlug); err != nil {
			t.Fatalf("resolve %d: %v", i, err)
		}
	}
}

func TestReceivePoint_DisabledFailsClosed(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m := seedMerchant(ctx, t, pool, "ACTIVE")
	rp, _ := svc.EnsureActive(ctx, m, "SANDBOX")

	if err := svc.Disable(ctx, m, "SANDBOX"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ResolveForPayment(ctx, rp.PublicSlug); !errors.Is(err, ErrReceivePointDisabled) {
		t.Fatalf("disabled point must fail closed, got %v", err)
	}
}

func TestReceivePoint_SuspendedBusinessFailsClosed(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m := seedMerchant(ctx, t, pool, "ACTIVE")
	rp, _ := svc.EnsureActive(ctx, m, "SANDBOX")

	// A later suspension must void the already-printed QR.
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, m); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ResolveForPayment(ctx, rp.PublicSlug); !errors.Is(err, ErrReceivePointIneligible) {
		t.Fatalf("suspended business must fail closed, got %v", err)
	}
}

func TestReceivePoint_UnknownSlug(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	if _, _, err := svc.ResolveForPayment(ctx, "totallyunknownslug123"); !errors.Is(err, ErrReceivePointNotFound) {
		t.Fatalf("unknown slug must be not-found, got %v", err)
	}
}
