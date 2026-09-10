package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Business App sessions against Postgres: a refresh token renews once, a
// replaced token presented again ends the whole sign-in, a sign-in has an
// absolute end, and renewal refuses a Business that is no longer ACTIVE or no
// longer owns the handle its login uses. DB-backed; skipped without
// DATABASE_URL or before migration 0120.

type sessionFixture struct {
	ctx      context.Context
	pool     *pgxpool.Pool
	merchant string
	handle   string
}

func newSessionFixture(t *testing.T) *sessionFixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed session test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.merchant_app_sessions')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("merchant_app_sessions not migrated — skipping")
	}
	f := &sessionFixture{ctx: ctx, pool: pool, merchant: uuid.NewString(), handle: "ss" + strings.ReplaceAll(uuid.NewString(), "-", "")[:10]}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO merchants (id, name, email, status, business_account_type, created_at, updated_at)
		  VALUES ($1, 'Sessão Lda', $2, 'ACTIVE', 'MERCHANT', now(), now())`, []any{f.merchant, f.handle + "@example.test"}},
		{`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1, 'MERCHANT', $2)`, []any{f.handle, f.merchant}},
		{`INSERT INTO merchant_app_credentials (merchant_id, environment, handle) VALUES ($1, 'SANDBOX', $2)`, []any{f.merchant, f.handle}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_sessions WHERE merchant_id = $1`, f.merchant)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE merchant_id = $1`, f.merchant)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle = $1`, f.handle)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id = $1`, f.merchant)
		pool.Close()
	})
	return f
}

func TestBusinessSession_RenewsOnceAndRotates(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)
	// A clock with nanoseconds, as on Linux (CI, the Sandbox): the macOS clock
	// stops at microseconds and hid a sign-in end that moved on renewal.
	svc.now = func() time.Time { return time.Now().Add(123 * time.Nanosecond) }
	first, err := svc.Open(f.ctx, f.merchant, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.Renew(f.ctx, first.RefreshToken)
	if err != nil {
		t.Fatalf("renewal of a fresh token: %v", err)
	}
	if second.RefreshToken == first.RefreshToken || second.MerchantID != f.merchant {
		t.Fatalf("renewal must hand out a NEW token for the same Business")
	}
	if !second.RefreshExpiresAt.Equal(first.RefreshExpiresAt) {
		t.Fatalf("renewal moved the sign-in's end: %v → %v", first.RefreshExpiresAt, second.RefreshExpiresAt)
	}
	var stored int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM merchant_app_sessions WHERE refresh_token_hash IN ($1, $2)`,
		first.RefreshToken, second.RefreshToken).Scan(&stored)
	if stored != 0 {
		t.Fatal("a raw refresh token was stored")
	}
	if _, err := svc.Renew(f.ctx, second.RefreshToken); err != nil {
		t.Fatalf("the successor renews: %v", err)
	}
}

func TestBusinessSession_ReplacedTokenPresentedAgainEndsTheSignIn(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)
	first, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	second, err := svc.Renew(f.ctx, first.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Renew(f.ctx, first.RefreshToken); !errors.Is(err, ErrSessionReused) {
		t.Fatalf("replaying a spent token: %v, want ErrSessionReused", err)
	}
	if _, err := svc.Renew(f.ctx, second.RefreshToken); !errors.Is(err, ErrSessionInvalid) {
		t.Fatalf("the successor must die with its family: %v", err)
	}
	var reason string
	_ = f.pool.QueryRow(f.ctx, `SELECT DISTINCT revoked_reason FROM merchant_app_sessions WHERE merchant_id = $1`, f.merchant).Scan(&reason)
	if reason != "REUSE_DETECTED" {
		t.Fatalf("revoked as %q", reason)
	}
}

func TestBusinessSession_ConcurrentRenewalsOfOneTokenYieldOneSuccessor(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)
	first, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	start := make(chan struct{})
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := svc.Renew(f.ctx, first.RefreshToken); err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	close(start)
	wg.Wait()
	if ok > 1 {
		t.Fatalf("%d renewals succeeded with one token — it must be spendable once", ok)
	}
}

func TestBusinessSession_HasAnAbsoluteEnd(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)
	first, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	svc.now = func() time.Time { return time.Now().Add(BusinessSessionLifetime + time.Minute) }
	if _, err := svc.Renew(f.ctx, first.RefreshToken); !errors.Is(err, ErrSessionInvalid) {
		t.Fatalf("a sign-in past its end renewed: %v", err)
	}
}

func TestBusinessSession_RenewalRefusesASuspendedBusinessAndAMovedHandle(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)

	s1, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	_, _ = f.pool.Exec(f.ctx, `UPDATE merchants SET status = 'SUSPENDED' WHERE id = $1`, f.merchant)
	if _, err := svc.Renew(f.ctx, s1.RefreshToken); !errors.Is(err, ErrSessionInvalid) {
		t.Fatalf("a suspended Business renewed: %v", err)
	}
	_, _ = f.pool.Exec(f.ctx, `UPDATE merchants SET status = 'ACTIVE' WHERE id = $1`, f.merchant)

	s2, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	_, _ = f.pool.Exec(f.ctx, `UPDATE handle_registry SET owner_id = $2 WHERE handle = $1`, f.handle, uuid.NewString())
	if _, err := svc.Renew(f.ctx, s2.RefreshToken); !errors.Is(err, ErrSessionInvalid) {
		t.Fatalf("a login whose handle left the Business renewed: %v", err)
	}
	var reasons string
	_ = f.pool.QueryRow(f.ctx, `SELECT string_agg(DISTINCT revoked_reason, ',' ORDER BY revoked_reason)
	                              FROM merchant_app_sessions WHERE merchant_id = $1`, f.merchant).Scan(&reasons)
	if reasons != "BUSINESS_NOT_ACTIVE,HANDLE_NOT_OWNED" {
		t.Fatalf("revocation reasons %q", reasons)
	}
}

func TestBusinessSession_SignOutEndsEveryRotation(t *testing.T) {
	f := newSessionFixture(t)
	svc := NewPostgresMerchantSessionService(f.pool)
	first, _ := svc.Open(f.ctx, f.merchant, "SANDBOX")
	second, _ := svc.Renew(f.ctx, first.RefreshToken)
	if err := svc.End(f.ctx, first.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Renew(f.ctx, second.RefreshToken); !errors.Is(err, ErrSessionInvalid) {
		t.Fatalf("signing out with an older rotation left the current one alive: %v", err)
	}
	if err := svc.End(f.ctx, "bzs_never_issued"); err != nil {
		t.Fatalf("signing out of nothing: %v", err)
	}
}
