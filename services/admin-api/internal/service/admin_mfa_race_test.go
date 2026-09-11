package service

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/auth"
)

// One TOTP code opens one session. Logins racing with the same code all read
// the same last_step; only one may move it forward.
func TestMFAVerify_OneCodeOneLoginUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed MFA test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.admin_mfa')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("admin_mfa not migrated — skipping")
	}

	id := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role) VALUES ($1, $2, 'MFA race', 'READ_ONLY')`, id, id+"@test"); err != nil {
		t.Fatalf("seed operator: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM admin_users WHERE id = $1`, id) //nolint:errcheck
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO admin_mfa (admin_user_id, secret_encrypted, confirmed_at) VALUES ($1, $2, now())`, id, secret); err != nil {
		t.Fatalf("seed factor: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM admin_mfa WHERE admin_user_id = $1`, id) //nolint:errcheck

	code, err := auth.TOTPCodeAt(secret, time.Now().Unix()/30)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewMFAService(pool, nil)
	const n = 12
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if svc.Verify(ctx, id, code) == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	close(start)
	wg.Wait()
	if ok != 1 {
		t.Fatalf("%d of %d concurrent logins accepted one code; want exactly 1", ok, n)
	}
}
