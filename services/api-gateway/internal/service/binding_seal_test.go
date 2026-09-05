package service

// ADR-055 against a real database. The invariant is about interleaving, so a
// mock cannot establish it: these tests use real rows, real locks and real
// concurrency. Skipped when DATABASE_URL is unset.

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func sealFixture(t *testing.T) (*pgxpool.Pool, *BindingSealService, string, string, string) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed binding seal tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// A throwaway workspace + project of our own: a test that seals somebody
	// else's binding would be destructive, and one that reuses a shared fixture
	// would be order-dependent.
	var wsID, projID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO developer.dev_workspaces (name, slug, created_by)
		 VALUES ('seal-test', 'seal-test-'||gen_random_uuid(), gen_random_uuid())
		 RETURNING id::text`).Scan(&wsID); err != nil {
		t.Skipf("cannot create workspace: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO developer.dev_projects (workspace_id, name, slug)
		 VALUES ($1, 'seal-test', 'seal-test-'||gen_random_uuid()) RETURNING id::text`,
		wsID).Scan(&projID); err != nil {
		t.Fatalf("create project: %v", err)
	}
	t.Cleanup(func() {
		c := context.Background()
		pool.Exec(c, `UPDATE developer.dev_project_sandbox_binding SET artifact_created=false WHERE project_id=$1`, projID)
		pool.Exec(c, `DELETE FROM developer.dev_project_sandbox_binding WHERE project_id=$1`, projID)
		pool.Exec(c, `DELETE FROM developer.dev_projects WHERE id=$1`, projID)
		pool.Exec(c, `DELETE FROM developer.dev_workspaces WHERE id=$1`, wsID)
	})
	return pool, NewBindingSealService(pool), projID, uuid.NewString(), uuid.NewString()
}

func bind(t *testing.T, pool *pgxpool.Pool, projID, merchant, wallet string) string {
	t.Helper()
	var id string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO developer.dev_project_sandbox_binding
		   (project_id, merchant_id, wallet_id, wallet_account_id, created_by_user_id)
		 VALUES ($1,$2,$3,gen_random_uuid(),gen_random_uuid()) RETURNING id::text`,
		projID, merchant, wallet).Scan(&id); err != nil {
		t.Fatalf("bind: %v", err)
	}
	return id
}

func sealed(t *testing.T, pool *pgxpool.Pool, projID string) bool {
	t.Helper()
	var v bool
	if err := pool.QueryRow(context.Background(),
		`SELECT artifact_created FROM developer.dev_project_sandbox_binding
		  WHERE project_id=$1 AND state='ACTIVE'`, projID).Scan(&v); err != nil {
		t.Fatalf("read seal: %v", err)
	}
	return v
}

func TestSeal_FirstArtifactSealsAndIsIdempotent(t *testing.T) {
	pool, svc, projID, m, w := sealFixture(t)
	bind(t, pool, projID, m, w)
	ctx := context.Background()

	if sealed(t, pool, projID) {
		t.Fatal("a fresh binding must start UNSEALED — the correction window is the point")
	}
	if err := svc.SealForArtifact(ctx, projID, m, w); err != nil {
		t.Fatalf("first artifact must seal: %v", err)
	}
	if !sealed(t, pool, projID) {
		t.Error("binding not sealed after the first artifact")
	}
	// A second artifact under the same binding is normal and must not fail.
	if err := svc.SealForArtifact(ctx, projID, m, w); err != nil {
		t.Errorf("seal must be idempotent: %v", err)
	}
}

// The payee the caller resolved must still be the ACTIVE binding. A stale
// snapshot is exactly how an artifact ends up issued for the wrong owner.
func TestSeal_RefusesWhenTheBindingMoved(t *testing.T) {
	pool, svc, projID, m, w := sealFixture(t)
	bind(t, pool, projID, m, w)
	if err := svc.SealForArtifact(context.Background(), projID, uuid.NewString(), w); err != ErrBindingMoved {
		t.Errorf("stale merchant: want ErrBindingMoved, got %v", err)
	}
	if sealed(t, pool, projID) {
		t.Error("a refused seal must not seal anything")
	}
}

// Two concurrent first artifacts must both resolve the SAME binding and both
// succeed. Neither may be refused, and there must be exactly one binding left.
func TestSeal_TwoConcurrentFirstArtifacts(t *testing.T) {
	pool, svc, projID, m, w := sealFixture(t)
	bind(t, pool, projID, m, w)

	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); errs[i] = svc.SealForArtifact(context.Background(), projID, m, w) }(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("concurrent artifact %d was refused: %v", i, err)
		}
	}
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM developer.dev_project_sandbox_binding WHERE project_id=$1 AND state='ACTIVE'`,
		projID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("active bindings = %d, want exactly 1", n)
	}
	if !sealed(t, pool, projID) {
		t.Error("binding must be sealed")
	}
}

// The race that matters: a first artifact against an operator rebind. There must
// be no outcome where the artifact is issued for owner A while the ACTIVE
// binding ends as owner B.
func TestSeal_ArtifactVersusRebindHasNoSplitBrain(t *testing.T) {
	pool, svc, projID, mA, wA := sealFixture(t)
	bind(t, pool, projID, mA, wA)
	mB, wB := uuid.NewString(), uuid.NewString()
	ctx := context.Background()

	var wg sync.WaitGroup
	var sealErr, rebindErr error
	wg.Add(2)
	go func() { defer wg.Done(); sealErr = svc.SealForArtifact(ctx, projID, mA, wA) }()
	go func() {
		defer wg.Done()
		// The rebind as the operator path performs it: supersede only an
		// UNSEALED active binding, then insert, in one transaction.
		tx, err := pool.Begin(ctx)
		if err != nil {
			rebindErr = err
			return
		}
		defer tx.Rollback(ctx)
		var old string
		_ = tx.QueryRow(ctx,
			`UPDATE developer.dev_project_sandbox_binding SET state='DISABLED', updated_at=now()
			  WHERE project_id=$1 AND state='ACTIVE' AND artifact_created=false RETURNING id::text`,
			projID).Scan(&old)
		if old == "" {
			rebindErr = ErrBindingMoved // sealed first: correctly refused
			return
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO developer.dev_project_sandbox_binding
			   (project_id, merchant_id, wallet_id, wallet_account_id, created_by_user_id)
			 VALUES ($1,$2,$3,gen_random_uuid(),gen_random_uuid())`, projID, mB, wB); err != nil {
			rebindErr = err
			return
		}
		rebindErr = tx.Commit(ctx)
	}()
	wg.Wait()

	var owner string
	var isSealed bool
	if err := pool.QueryRow(ctx,
		`SELECT merchant_id::text, artifact_created FROM developer.dev_project_sandbox_binding
		  WHERE project_id=$1 AND state='ACTIVE'`, projID).Scan(&owner, &isSealed); err != nil {
		t.Fatalf("final binding: %v", err)
	}

	switch {
	case sealErr == nil:
		// The artifact won: it was issued for A, so A must be the sealed owner.
		if owner != mA || !isSealed {
			t.Errorf("artifact sealed A but the binding ended owner=%s sealed=%v — split brain", owner, isSealed)
		}
	case sealErr == ErrBindingMoved:
		// The rebind won before any artifact: B owns it, and no artifact was
		// ever issued against A.
		if owner != mB {
			t.Errorf("seal refused but the owner is %s, want the rebound owner %s", owner, mB)
		}
		if rebindErr != nil {
			t.Errorf("seal was refused, so the rebind must have succeeded: %v", rebindErr)
		}
	default:
		t.Fatalf("unexpected seal error: %v", sealErr)
	}
}

// Database enforcement, independent of any service guard (migration 0105).
func TestSeal_DatabaseRefusesToMoveASealedBinding(t *testing.T) {
	pool, svc, projID, m, w := sealFixture(t)
	bind(t, pool, projID, m, w)
	ctx := context.Background()
	if err := svc.SealForArtifact(ctx, projID, m, w); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ name, sql string }{
		{"disable", `UPDATE developer.dev_project_sandbox_binding SET state='DISABLED' WHERE project_id=$1 AND state='ACTIVE'`},
		{"repoint", `UPDATE developer.dev_project_sandbox_binding SET merchant_id=gen_random_uuid() WHERE project_id=$1 AND state='ACTIVE'`},
		{"un-seal", `UPDATE developer.dev_project_sandbox_binding SET artifact_created=false WHERE project_id=$1 AND state='ACTIVE'`},
		{"delete", `DELETE FROM developer.dev_project_sandbox_binding WHERE project_id=$1 AND state='ACTIVE'`},
	} {
		if _, err := pool.Exec(ctx, c.sql, projID); err == nil {
			t.Errorf("%s of a SEALED binding succeeded — the database must refuse it (ADR-055)", c.name)
		}
	}
	if !sealed(t, pool, projID) {
		t.Error("the binding must still be sealed and unmoved")
	}
}
