package service

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// A9-01. A consumer's PIN login had no per-account limit — only 10 a minute per
// IP — and the token it yields moves money. Five wrong PINs now lock the handle
// for fifteen minutes; racing guesses cannot slip past the count.
func TestVerify_WrongPinsLockTheAccountEvenUnderConcurrency(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed credential test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	seed := func() (string, string) {
		id := uuid.NewString()
		handle := "lk" + id[:8]
		if _, err := pool.Exec(ctx, `INSERT INTO consumers (id, handle, status) VALUES ($1,$2,'ACTIVE')`, id, handle); err != nil {
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

	// A correct PIN before the limit clears the count.
	_, h1 := seed()
	for i := 0; i < 3; i++ {
		if _, err := store.Verify(ctx, h1, "000000"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("wrong PIN %d: %v", i, err)
		}
	}
	if _, err := store.Verify(ctx, h1, "246810"); err != nil {
		t.Fatalf("the right PIN within the limit was refused: %v", err)
	}
	for i := 0; i < 4; i++ {
		if _, err := store.Verify(ctx, h1, "000000"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("after a reset, wrong PIN %d: %v", i, err)
		}
	}

	// Fifty concurrent guesses: at most five are compared, then the account is
	// locked — and the right PIN waits for the lock like any other.
	_, h2 := seed()
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; _, _ = store.Verify(ctx, h2, "000000") }()
	}
	close(start)
	wg.Wait()
	var attempts int
	_ = pool.QueryRow(ctx, `SELECT failed_attempts FROM public_api_credentials WHERE handle = $1`, h2).Scan(&attempts)
	if attempts > maxLoginAttempts {
		t.Fatalf("%d PINs were compared under a race, want at most %d", attempts, maxLoginAttempts)
	}
	if _, err := store.Verify(ctx, h2, "246810"); !errors.Is(err, ErrCredentialsLocked) {
		t.Fatalf("a locked account accepted its PIN: %v", err)
	}
}
