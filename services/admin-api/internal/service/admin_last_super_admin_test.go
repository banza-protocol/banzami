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

// Two SUPER_ADMINs suspending each other at the same moment must not leave the
// console with none. Needs a database with no other active SUPER_ADMIN (CI's
// is freshly migrated); otherwise the guard is never at its edge and the test
// says so instead of passing.
func TestLastSuperAdmin_ConcurrentSuspensionsLeaveOne(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed operator test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var others int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE role='SUPER_ADMIN' AND status<>'SUSPENDED'`).Scan(&others); err != nil {
		t.Skipf("admin_users not readable: %v", err)
	}
	if others != 0 {
		t.Skipf("%d other active SUPER_ADMIN(s) in this database — the guard cannot be at its edge", others)
	}

	svc := NewAdminUserService(pool)
	for round := 0; round < 10; round++ {
		a, b := uuid.NewString(), uuid.NewString()
		for _, id := range []string{a, b} {
			if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role, status, password_hash) VALUES ($1, $2, 'SA race', 'SUPER_ADMIN', 'ACTIVE', 'x')`, id, id+"@test"); err != nil {
				t.Fatalf("seed: %v", err)
			}
		}
		var wg sync.WaitGroup
		errs := make([]error, 2)
		start := make(chan struct{})
		for i, target := range []string{a, b} {
			wg.Add(1)
			go func(i int, target string) {
				defer wg.Done()
				<-start
				errs[i] = svc.SetOperatorStatus(ctx, target, "SUSPENDED", "")
			}(i, target)
		}
		close(start)
		wg.Wait()
		var n int
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE role='SUPER_ADMIN' AND status<>'SUSPENDED'`).Scan(&n)
		pool.Exec(ctx, `DELETE FROM admin_users WHERE id IN ($1, $2)`, a, b) //nolint:errcheck
		if n != 1 {
			t.Fatalf("round %d: %d active SUPER_ADMINs after two concurrent suspensions (errors %v, %v); want 1", round, n, errs[0], errs[1])
		}
		refused := 0
		for _, e := range errs {
			if errors.Is(e, ErrLastSuperAdmin) {
				refused++
			}
		}
		if refused != 1 {
			t.Fatalf("round %d: want exactly one ErrLastSuperAdmin, got %v, %v", round, errs[0], errs[1])
		}
	}
}

// A5-11: an INVITED SUPER_ADMIN who never set a password does not keep the
// console administered. With one real SUPER_ADMIN and one unused invite, the
// real one cannot demote themselves.
func TestLastSuperAdmin_AnUnusedInviteDoesNotCount(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed operator test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var others int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM admin_users WHERE `+superAdminWhoCanAdminister).Scan(&others)
	if others != 0 {
		t.Skipf("%d other SUPER_ADMIN(s) here — the guard cannot be at its edge", others)
	}
	real, invited := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role, status, password_hash) VALUES ($1,$2,'real','SUPER_ADMIN','ACTIVE','x')`, real, real+"@test"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO admin_users (id, email, full_name, role, status) VALUES ($1,$2,'invited','SUPER_ADMIN','INVITED')`, invited, invited+"@test"); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM admin_users WHERE id IN ($1,$2)`, real, invited) //nolint:errcheck

	err = NewAdminUserService(pool).execOperatorKeepingASuperAdmin(ctx,
		`UPDATE admin_users SET role = 'OPERATIONS' WHERE id = $1`, real)
	if !errors.Is(err, ErrLastSuperAdmin) {
		t.Fatalf("the only SUPER_ADMIN demoted themselves beside an unused invite (err %v)", err)
	}
}
