package service

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// fakeProvisioner is a coreProvisioner that records calls and (optionally) inserts
// a real merchants row so the gateway Phase-B FKs (merchant_profiles → merchants)
// are satisfied without a live core-api.
type fakeProvisioner struct {
	pool               *pgxpool.Pool
	createMerchantHook func() (string, error)
	createMerchant     int
}

func (f *fakeProvisioner) CreateMerchant(ctx context.Context, name, email string) (string, error) {
	f.createMerchant++
	return f.createMerchantHook()
}
func (f *fakeProvisioner) CreateWallet(ctx context.Context, merchantID, currency string) (string, error) {
	return "", nil // empty → NULL wallet_id, avoids a wallets FK in the test
}
func (f *fakeProvisioner) CreateApiKey(ctx context.Context, merchantID, name, environment string) (string, error) {
	return "kp_test", nil
}
func (f *fakeProvisioner) ApproveCompliance(ctx context.Context, merchantID string) error { return nil }

func appAdminPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed approval test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.merchant_applications')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("merchant_applications not migrated — skipping")
	}
	return pool
}

// Audit Part 8 / bug #5: a retried approval must RESUME on the already-created
// merchant, never create a duplicate. With created_merchant_id pre-set, Approve
// must not call CreateMerchant.
func TestApprove_ResumesExistingMerchant(t *testing.T) {
	ctx := context.Background()
	pool := appAdminPoolOrSkip(ctx, t)
	defer pool.Close()

	merchantID := uuid.NewString()
	appID := uuid.NewString()
	handle := "t_" + uuid.NewString()[:8]
	email := handle + "@example.test"

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_activation_tokens WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_profiles WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_applications WHERE id=$1`, appID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})

	// A merchant from a prior, partially-failed attempt already exists…
	if _, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email) VALUES ($1,$2,$3)`,
		merchantID, "Resume Co", email); err != nil {
		t.Fatalf("seed merchant: %v", err)
	}
	// …and the application already records it.
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_reason) VALUES ($1,'SYSTEM',NULL,'application')`, handle); err != nil {
		t.Fatalf("seed handle: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email, created_merchant_id)
		 VALUES ($1,'SUBMITTED','SANDBOX',$2,'Resume Co',$3,$4)`,
		appID, handle, email, merchantID); err != nil {
		t.Fatalf("seed application: %v", err)
	}

	fake := &fakeProvisioner{createMerchantHook: func() (string, error) {
		t.Fatal("CreateMerchant must NOT be called when the application already has a merchant id")
		return "", nil
	}}
	svc := NewPostgresMerchantApplicationAdminService(pool, fake)

	res, err := svc.Approve(ctx, appID, "tester", time.Hour)
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	if res.MerchantID != merchantID {
		t.Fatalf("resumed on the wrong merchant: got %s want %s", res.MerchantID, merchantID)
	}
	if fake.createMerchant != 0 {
		t.Fatalf("CreateMerchant called %d times on resume (want 0)", fake.createMerchant)
	}
}

// The fresh path creates exactly one merchant and persists its id immediately, so a
// subsequent failure would resume rather than duplicate.
func TestApprove_FreshCreatesAndRecordsMerchant(t *testing.T) {
	ctx := context.Background()
	pool := appAdminPoolOrSkip(ctx, t)
	defer pool.Close()

	merchantID := uuid.NewString()
	appID := uuid.NewString()
	handle := "t_" + uuid.NewString()[:8]
	email := handle + "@example.test"

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_activation_tokens WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_profiles WHERE merchant_id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchant_applications WHERE id=$1`, appID)
		_, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, merchantID)
		_, _ = pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})

	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_reason) VALUES ($1,'SYSTEM',NULL,'application')`, handle); err != nil {
		t.Fatalf("seed handle: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email)
		 VALUES ($1,'SUBMITTED','SANDBOX',$2,'Fresh Co',$3)`,
		appID, handle, email); err != nil {
		t.Fatalf("seed application: %v", err)
	}

	// The fake "core" inserts a real merchants row (as core would) and returns its id.
	fake := &fakeProvisioner{pool: pool, createMerchantHook: func() (string, error) {
		_, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email) VALUES ($1,$2,$3)`,
			merchantID, "Fresh Co", email)
		return merchantID, err
	}}
	svc := NewPostgresMerchantApplicationAdminService(pool, fake)

	res, err := svc.Approve(ctx, appID, "tester", time.Hour)
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	if fake.createMerchant != 1 {
		t.Fatalf("CreateMerchant called %d times (want 1)", fake.createMerchant)
	}
	if res.MerchantID != merchantID {
		t.Fatalf("wrong merchant id: %s", res.MerchantID)
	}
	// created_merchant_id persisted and status APPROVED.
	var status, recorded string
	_ = pool.QueryRow(ctx, `SELECT status, created_merchant_id::text FROM merchant_applications WHERE id=$1`, appID).
		Scan(&status, &recorded)
	if status != "APPROVED" || recorded != merchantID {
		t.Fatalf("application not finalized: status=%s created_merchant_id=%s", status, recorded)
	}
}
