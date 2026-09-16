package service

import (
	"context"
	"errors"
	"os"
	"strings"
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

// fakeSessions models core's Payment Session engine INCLUDING its documented
// idempotency: one session per (merchant, purpose, reference). Re-creating with
// the same reference returns the same session — the boundary the mint relies on
// for crash consistency (per §35, the double mirrors the audited core behaviour).
type fakeSessions struct {
	mu      sync.Mutex
	byRef   map[string]*PaymentSession
	creates int // sessions actually created (not idempotent replays)
	calls   []CreatePaymentSessionInput
}

func (f *fakeSessions) Create(_ context.Context, in CreatePaymentSessionInput) (*PaymentSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.byRef == nil {
		f.byRef = map[string]*PaymentSession{}
	}
	ref := in.MerchantID + "\x00" + in.Purpose + "\x00" + in.ReferenceType + "\x00" + in.ReferenceID
	if s, ok := f.byRef[ref]; ok {
		return s, nil // core idempotency: same reference → same session
	}
	f.creates++
	f.calls = append(f.calls, in)
	s := &PaymentSession{SessionID: "sess-" + uuid.NewString(), MerchantID: in.MerchantID, WalletAccountID: in.WalletAccountID, AmountMinor: in.AmountMinor, Status: "CREATED"}
	f.byRef[ref] = s
	return s, nil
}
func (f *fakeSessions) Get(_ context.Context, id string) (*PaymentSession, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, s := range f.byRef {
		if s.SessionID == id {
			return s, nil
		}
	}
	return nil, nil
}
func (f *fakeSessions) List(context.Context, string, string, int) ([]PaymentSession, error) {
	return nil, nil
}
func (f *fakeSessions) GetByInterface(context.Context, string, string) (*PaymentSession, error) {
	return nil, nil
}

// seedReceivableBusiness makes an ACTIVE merchant with a @handle and an AOA wallet
// (the 0081 trigger gives it a PRIMARY wallet_account) — a business that can receive.
func seedReceivableBusiness(ctx context.Context, t *testing.T, pool *pgxpool.Pool) (merchantID, primaryAccountID string) {
	t.Helper()
	merchantID = seedMerchant(ctx, t, pool, "ACTIVE")
	if _, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`,
		"loja"+merchantID[:8], merchantID); err != nil {
		t.Fatalf("seed handle: %v", err)
	}
	acc := func() string {
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','wallet','AOA') RETURNING id::text`).Scan(&id); err != nil {
			t.Fatalf("seed ledger account: %v", err)
		}
		return id
	}
	avail, reserved := acc(), acc()
	if _, err := pool.Exec(ctx,
		`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES (gen_random_uuid(),$1,'AOA','ACTIVE',$2,$3)`,
		merchantID, avail, reserved); err != nil {
		t.Fatalf("seed wallet: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT wa.id::text FROM wallet_accounts wa JOIN wallets w ON w.id=wa.wallet_id WHERE w.merchant_id=$1 AND wa.purpose='PRIMARY'`,
		merchantID).Scan(&primaryAccountID); err != nil {
		t.Fatalf("primary account (trigger): %v", err)
	}
	return merchantID, primaryAccountID
}

func mintFixture(ctx context.Context, t *testing.T) (*BusinessReceivePointService, *pgxpool.Pool, string, string, string) {
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m, primaryAcc := seedReceivableBusiness(ctx, t, pool)
	rp, err := svc.EnsureActive(ctx, m, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}
	return svc, pool, m, primaryAcc, rp.PublicSlug
}

func TestReceivePoint_MintFreshSessionPerPayment(t *testing.T) {
	ctx := context.Background()
	svc, _, m, primaryAcc, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer := "payer-" + uuid.NewString()

	a, err := svc.MintSession(ctx, fake, payer, slug, "k-"+uuid.NewString(), 1000)
	if err != nil {
		t.Fatalf("mint A: %v", err)
	}
	b, err := svc.MintSession(ctx, fake, payer, slug, "k-"+uuid.NewString(), 2500)
	if err != nil {
		t.Fatalf("mint B: %v", err)
	}
	if a.SessionID == b.SessionID {
		t.Fatal("distinct payments must be distinct sessions")
	}
	if fake.creates != 2 {
		t.Fatalf("want 2 sessions created, got %d", fake.creates)
	}
	for i, c := range fake.calls {
		if c.MerchantID != m || c.WalletAccountID != primaryAcc {
			t.Fatalf("call %d payee not server-resolved: %+v", i, c)
		}
		if c.ReferenceType != "BUSINESS_RECEIVE_POINT" {
			t.Fatalf("call %d reference type wrong: %+v", i, c)
		}
	}
	if *fake.calls[0].AmountMinor != 1000 || *fake.calls[1].AmountMinor != 2500 {
		t.Fatal("amounts not threaded")
	}
}

func TestReceivePoint_MintIdempotentSameKey(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "same-"+uuid.NewString()

	a, err := svc.MintSession(ctx, fake, payer, slug, key, 1000)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.MintSession(ctx, fake, payer, slug, key, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if a.SessionID != b.SessionID {
		t.Fatalf("same key+request must replay the same session: %q vs %q", a.SessionID, b.SessionID)
	}
	if fake.creates != 1 {
		t.Fatalf("same key must create exactly one session, got %d", fake.creates)
	}
}

func TestReceivePoint_MintFingerprintConflict(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()

	if _, err := svc.MintSession(ctx, fake, payer, slug, key, 1000); err != nil {
		t.Fatal(err)
	}
	// same key, DIFFERENT amount → deterministic conflict, never a wrong-amount replay.
	if _, err := svc.MintSession(ctx, fake, payer, slug, key, 9999); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("reused key with different amount must conflict, got %v", err)
	}
	if fake.creates != 1 {
		t.Fatalf("conflict must not create a second session, got %d", fake.creates)
	}
}

func TestReceivePoint_MintCrossPayerNoCollision(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	key := "shared-key"

	a, err := svc.MintSession(ctx, fake, "payer-A-"+uuid.NewString(), slug, key, 1000)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.MintSession(ctx, fake, "payer-B-"+uuid.NewString(), slug, key, 1000)
	if err != nil {
		t.Fatalf("a second payer's identical key must be independent, got %v", err)
	}
	if a.SessionID == b.SessionID {
		t.Fatal("two payers sharing a key must not share a session")
	}
	if fake.creates != 2 {
		t.Fatalf("want 2 independent sessions, got %d", fake.creates)
	}
}

func TestReceivePoint_MintCrashBeforeCreateRecovers(t *testing.T) {
	ctx := context.Background()
	svc, pool, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()
	// Simulate: a prior attempt reserved the key and crashed BEFORE creating a
	// session (PENDING, no session_id, no core session for the reference).
	fp := requestFingerprint(slug, "AOA", 1000)
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, state, updated_at) VALUES ($1,$2,$3,$4,'PENDING', now() - interval '1 hour')`,
		payer, key, slug, fp); err != nil {
		t.Fatal(err)
	}
	got, err := svc.MintSession(ctx, fake, payer, slug, key, 1000)
	if err != nil {
		t.Fatalf("retry after crash-before-create must recover, got %v", err)
	}
	if got.SessionID == "" || fake.creates != 1 {
		t.Fatalf("recovery must create exactly one session, creates=%d", fake.creates)
	}
}

func TestReceivePoint_MintCrashAfterCreateNoDuplicate(t *testing.T) {
	ctx := context.Background()
	svc, pool, m, primaryAcc, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()
	// Simulate: a prior attempt reserved the key AND core created the session for
	// the deterministic reference, but the gateway crashed before recording it.
	fp := requestFingerprint(slug, "AOA", 1000)
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, state, updated_at) VALUES ($1,$2,$3,$4,'PENDING', now() - interval '1 hour')`,
		payer, key, slug, fp); err != nil {
		t.Fatal(err)
	}
	ref := mintReference(payer, key)
	amt := int64(1000)
	pre, _ := fake.Create(ctx, CreatePaymentSessionInput{MerchantID: m, WalletAccountID: primaryAcc, AmountMinor: &amt, Currency: "AOA", Purpose: "GENERIC", ReferenceType: "BUSINESS_RECEIVE_POINT", ReferenceID: ref})
	if fake.creates != 1 {
		t.Fatal("precondition: one pre-created session")
	}
	got, err := svc.MintSession(ctx, fake, payer, slug, key, 1000)
	if err != nil {
		t.Fatalf("retry after crash-after-create must recover, got %v", err)
	}
	if got.SessionID != pre.SessionID {
		t.Fatalf("must recover the SAME session, got %q want %q", got.SessionID, pre.SessionID)
	}
	if fake.creates != 1 {
		t.Fatalf("crash-after-create must NOT create a duplicate, creates=%d", fake.creates)
	}
}

func TestReceivePoint_MintKeyRaceCreatesOneSession(t *testing.T) {
	ctx := context.Background()
	svc, pool, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "race-"+uuid.NewString()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = svc.MintSession(ctx, fake, payer, slug, key, 1000) }()
	}
	wg.Wait()
	if fake.creates != 1 {
		t.Fatalf("concurrent same-key mints created %d sessions, want exactly 1", fake.creates)
	}
	var rows int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM business_receive_point_mints WHERE payer_id=$1 AND idempotency_key=$2`, payer, key).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("want one mint row for the key, got %d", rows)
	}
}

func TestReceivePoint_MintFailsClosedWhenIneligible(t *testing.T) {
	ctx := context.Background()
	svc, pool, m, _, slug := mintFixture(ctx, t)
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, m); err != nil {
		t.Fatal(err)
	}
	fake := &fakeSessions{}
	if _, err := svc.MintSession(ctx, fake, "payer-"+uuid.NewString(), slug, "k-"+uuid.NewString(), 1000); !errors.Is(err, ErrReceivePointIneligible) {
		t.Fatalf("suspended business mint must fail closed, got %v", err)
	}
	if fake.creates != 0 {
		t.Fatal("no session may be created for an ineligible business")
	}
}

func TestReceivePoint_MintKeyValidation(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	if _, err := svc.MintSession(ctx, fake, "p", slug, "", 1000); !errors.Is(err, ErrMintKeyRequired) {
		t.Fatalf("empty key must be rejected, got %v", err)
	}
	long := make([]byte, maxMintKeyLen+1)
	for i := range long {
		long[i] = 'x'
	}
	if _, err := svc.MintSession(ctx, fake, "p", slug, string(long), 1000); !errors.Is(err, ErrMintKeyTooLong) {
		t.Fatalf("oversized key must be rejected, got %v", err)
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

func TestReceivePoint_CoreReferenceIdempotencyIsDbEnforced(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	// §0: core's "one session per (merchant, purpose, reference)" is a real partial
	// unique index, not only a SELECT-then-INSERT comment — so a retry cannot
	// duplicate even under the create race.
	var def string
	if err := pool.QueryRow(ctx,
		`SELECT indexdef FROM pg_indexes WHERE indexname='payment_sessions_reference_uidx'`).Scan(&def); err != nil {
		t.Fatalf("expected payment_sessions_reference_uidx (core reference idempotency): %v", err)
	}
	for _, want := range []string{"UNIQUE", "merchant_id", "purpose", "reference_type", "reference_id", "reference_id IS NOT NULL"} {
		if !strings.Contains(def, want) {
			t.Fatalf("reference idempotency index missing %q: %s", want, def)
		}
	}
}

func TestReceivePoint_MintReferencePrivacyAndDeterminism(t *testing.T) {
	payer, key, slug := "payer-uuid-123", "super-secret-idempotency-key", "rcvSlugABC123"
	ref := mintReference(payer, key)
	if ref != mintReference(payer, key) {
		t.Fatal("reference must be deterministic")
	}
	if mintReference(payer, "other") == ref || mintReference("other", key) == ref {
		t.Fatal("reference must vary by (payer, key)")
	}
	if strings.Contains(ref, payer) || strings.Contains(ref, key) || strings.Contains(ref, slug) {
		t.Fatal("reference must not embed raw payer/key/slug")
	}
	if len(ref) != 64 {
		t.Fatalf("reference must be a bounded 64-hex digest, got %d", len(ref))
	}
}
