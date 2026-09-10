package service

import (
	"context"
	"errors"
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
	walletHook         func() (string, error) // optional; default returns a fresh uuid
	// walletForMerchant, when set, creates a real wallet for the merchant.
	walletForMerchant func(merchantID string) (string, error)
	createMerchant    int
	createWallet      int
	createApiKey      int
	approveCompliance int
	assignPricing     int
	lastProfile       string
}

func (f *fakeProvisioner) CreateMerchant(ctx context.Context, name, email, businessAccountType string) (string, error) {
	f.createMerchant++
	return f.createMerchantHook()
}
func (f *fakeProvisioner) CreateWallet(ctx context.Context, merchantID, currency string) (string, error) {
	f.createWallet++
	if f.walletForMerchant != nil {
		return f.walletForMerchant(merchantID)
	}
	if f.walletHook != nil {
		return f.walletHook()
	}
	return uuid.NewString(), nil // wallet_id has no FK — a fake uuid is fine
}
func (f *fakeProvisioner) CreateApiKey(ctx context.Context, merchantID, name, environment string) (string, error) {
	f.createApiKey++
	return "kp_test", nil
}
func (f *fakeProvisioner) ApproveCompliance(ctx context.Context, merchantID string) error {
	f.approveCompliance++
	return nil
}
func (f *fakeProvisioner) AssignPricingProfile(ctx context.Context, merchantID, profileCode string) error {
	f.assignPricing++
	f.lastProfile = profileCode
	return nil
}

// seedRequiredDocs makes an application complete against the requirements
// policy: every required field and the documents a review is made on.
func seedRequiredDocs(ctx context.Context, t *testing.T, pool *pgxpool.Pool, appID string) {
	t.Helper()
	if _, err := pool.Exec(ctx,
		`UPDATE merchant_applications
		    SET category = COALESCE(category, 'Retalho'), phone = COALESCE(phone, '+244 923456789'),
		        nif = COALESCE(nif, '5001234567'), province = COALESCE(province, 'Luanda'),
		        municipality = COALESCE(municipality, 'Talatona'), address = COALESCE(address, 'Rua 1'),
		        legal_representative = COALESCE(legal_representative, 'João da Silva'),
		        representative_role = COALESCE(representative_role, 'Proprietário'),
		        business_activity = COALESCE(business_activity, 'Loja'),
		        terms_accepted_at = COALESCE(terms_accepted_at, now())
		  WHERE id = $1`, appID); err != nil {
		t.Fatalf("complete application: %v", err)
	}
	for _, typ := range requiredApplicationDocuments {
		if _, err := pool.Exec(ctx,
			`INSERT INTO merchant_application_documents
			   (id, application_id, document_type, original_filename, storage_bucket, storage_key, mime_type, size_bytes, status, uploaded_at, confirmed_at)
			 VALUES ($1,$2,$3,'doc.pdf','test',$4,'application/pdf',1024,'UPLOADED',now(),now())`,
			uuid.NewString(), appID, typ, "kyb/test/"+appID+"/"+typ); err != nil {
			t.Fatalf("seed document %s: %v", typ, err)
		}
	}
}

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
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_reason) VALUES ($1,'APPLICATION',$2,'application')`, handle, appID); err != nil {
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
	seedRequiredDocs(ctx, t, pool, appID)
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

	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_reason) VALUES ($1,'APPLICATION',$2,'application')`, handle, appID); err != nil {
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
	seedRequiredDocs(ctx, t, pool, appID)
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

// Audit Part 8 / Unit 4: a provisioning failure must mark PROVISIONING_FAILED
// (visible + reprocessable), and reprocessing must RESUME each step (no duplicate
// merchant/wallet) and complete to APPROVED.
func TestApprove_FailsThenResumesWithoutDuplication(t *testing.T) {
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

	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_reason) VALUES ($1,'APPLICATION',$2,'application')`, handle, appID); err != nil {
		t.Fatalf("seed handle: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_applications (id, status, environment, desired_handle, business_name, email)
		 VALUES ($1,'SUBMITTED','SANDBOX',$2,'Saga Co',$3)`, appID, handle, email); err != nil {
		t.Fatalf("seed application: %v", err)
	}

	failWallet := true
	fake := &fakeProvisioner{
		pool: pool,
		createMerchantHook: func() (string, error) {
			_, err := pool.Exec(ctx, `INSERT INTO merchants (id, name, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, merchantID, "Saga Co", email)
			return merchantID, err
		},
		walletHook: func() (string, error) {
			if failWallet {
				return "", errors.New("core wallet service unavailable")
			}
			return uuid.NewString(), nil
		},
	}
	seedRequiredDocs(ctx, t, pool, appID)
	svc := NewPostgresMerchantApplicationAdminService(pool, fake)

	// First attempt fails at the wallet step.
	if _, err := svc.Approve(ctx, appID, "tester", time.Hour); err == nil {
		t.Fatal("expected the wallet step to fail")
	}
	var status, mid, wid, perr string
	_ = pool.QueryRow(ctx,
		`SELECT status, COALESCE(created_merchant_id::text,''), COALESCE(provisioning_wallet_id::text,''), COALESCE(provisioning_error,'')
		   FROM merchant_applications WHERE id=$1`, appID).Scan(&status, &mid, &wid, &perr)
	if status != "PROVISIONING_FAILED" {
		t.Fatalf("want PROVISIONING_FAILED, got %s", status)
	}
	if mid != merchantID {
		t.Fatal("merchant step should be recorded after failure (resumable)")
	}
	if wid != "" {
		t.Fatal("wallet must NOT be recorded after its failure")
	}
	if perr == "" {
		t.Fatal("provisioning_error must be set for operator visibility")
	}
	if fake.createMerchant != 1 {
		t.Fatalf("CreateMerchant called %d times before reprocess", fake.createMerchant)
	}

	// Reprocess — wallet now succeeds. Must resume (no duplicate merchant) → APPROVED.
	failWallet = false
	res, err := svc.Approve(ctx, appID, "tester", time.Hour)
	if err != nil {
		t.Fatalf("reprocess: %v", err)
	}
	if fake.createMerchant != 1 {
		t.Fatalf("merchant DUPLICATED on reprocess: CreateMerchant=%d (want 1)", fake.createMerchant)
	}
	if res.MerchantID != merchantID {
		t.Fatalf("resumed wrong merchant: %s", res.MerchantID)
	}
	_ = pool.QueryRow(ctx, `SELECT status FROM merchant_applications WHERE id=$1`, appID).Scan(&status)
	if status != "APPROVED" {
		t.Fatalf("reprocess did not finalize: status=%s", status)
	}
}
