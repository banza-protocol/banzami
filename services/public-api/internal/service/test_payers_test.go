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

func testPayerPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed test payer test")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(context.Background(), `SELECT to_regclass('public.sandbox_test_payers')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("sandbox_test_payers not migrated in this DB — skipping")
	}
	t.Cleanup(pool.Close)
	return pool
}

func newConsumer(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := pool.Exec(context.Background(), `INSERT INTO consumers (id, handle) VALUES ($1, $2)`, id, "tpt"+id[:8]); err != nil {
		t.Fatal(err)
	}
	return id
}

// A payer belongs to one Project; another Project cannot read it.
func TestTestPayerStore_ProjectIsolation(t *testing.T) {
	pool := testPayerPool(t)
	s := NewTestPayerStore(pool)
	ctx := context.Background()
	a, b := uuid.NewString(), uuid.NewString()
	c := newConsumer(t, pool)
	if err := s.Record(ctx, c, a, nil); err != nil {
		t.Fatal(err)
	}
	if p, err := s.Get(ctx, a, c); err != nil || p.ConsumerID != c {
		t.Fatalf("own project: %v", err)
	}
	if _, err := s.Get(ctx, b, c); !errors.Is(err, ErrTestPayerNotFound) {
		t.Fatalf("another Project read the payer: %v", err)
	}
	if list, _ := s.List(ctx, b, true); len(list) != 0 {
		t.Fatalf("another Project listed %d payer(s)", len(list))
	}
	if n, _ := s.CountActive(ctx, a); n != 1 {
		t.Fatalf("active count %d", n)
	}
	_ = s.MarkRetired(ctx, a, c)
	if n, _ := s.CountActive(ctx, a); n != 0 {
		t.Fatalf("a retired payer still counts: %d", n)
	}
	if list, _ := s.List(ctx, a, false); len(list) != 0 {
		t.Fatal("a retired payer is listed without include_retired")
	}
}

// Top-ups are idempotent per key and bounded per Project per day, and
// concurrent requests cannot both take the last slot.
func TestTestPayerStore_TopUpIdempotencyAndQuota(t *testing.T) {
	pool := testPayerPool(t)
	s := NewTestPayerStore(pool)
	ctx := context.Background()
	project := uuid.NewString()
	c := newConsumer(t, pool)
	_ = s.Record(ctx, c, project, nil)

	if replay, err := s.ReserveTopUp(ctx, project, c, 1000, "TOP_UP", "k1"); err != nil || replay {
		t.Fatalf("first: %v %v", replay, err)
	}
	if replay, err := s.ReserveTopUp(ctx, project, c, 1000, "TOP_UP", "k1"); err != nil || !replay {
		t.Fatalf("same key, same top-up must replay: %v %v", replay, err)
	}
	if _, err := s.ReserveTopUp(ctx, project, c, 2000, "TOP_UP", "k1"); !errors.Is(err, ErrFundingKeyReused) {
		t.Fatalf("same key, another amount: %v", err)
	}

	// Fill the daily count concurrently: exactly the remaining slots succeed.
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok, quota := 0, 0
	for i := 0; i < TestPayerMaxTopUpsPerDay+5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := s.ReserveTopUp(ctx, project, c, 1, "TOP_UP", "c"+uuid.NewString())
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				ok++
			case errors.Is(err, ErrTestPayerQuota):
				quota++
			default:
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if ok != TestPayerMaxTopUpsPerDay-1 || quota != 6 {
		t.Fatalf("daily quota under concurrency: %d admitted, %d refused (want %d, 6)", ok, quota, TestPayerMaxTopUpsPerDay-1)
	}
	// A grant does not consume the top-up quota.
	if _, err := s.ReserveTopUp(ctx, project, c, TestPayerGrantMinor, "GRANT", "grant-"+c); err != nil {
		t.Fatalf("grant refused by the top-up quota: %v", err)
	}
	// A released reservation frees its slot.
	s.ReleaseTopUp(ctx, project, "k1")
	if _, err := s.ReserveTopUp(ctx, project, c, 1, "TOP_UP", "k-after-release"); err != nil {
		t.Fatalf("after release: %v", err)
	}
}
