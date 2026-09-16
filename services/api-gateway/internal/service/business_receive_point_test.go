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
	// session (PENDING, no session_id, expired lease, no core session yet).
	fp := requestFingerprint(slug, "AOA", 1000)
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, core_reference, owner_token, lease_until, state)
		 VALUES ($1,$2,$3,$4,$5, gen_random_uuid(), now() - interval '1 hour', 'PENDING')`,
		payer, key, slug, fp, "brp_"+uuid.NewString()); err != nil {
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
	// Simulate: a prior attempt reserved the key with a persisted core_reference AND
	// core created the session for that reference, but the gateway crashed (expired
	// lease) before recording it.
	fp := requestFingerprint(slug, "AOA", 1000)
	ref := "brp_" + uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, core_reference, owner_token, lease_until, state)
		 VALUES ($1,$2,$3,$4,$5, gen_random_uuid(), now() - interval '1 hour', 'PENDING')`,
		payer, key, slug, fp, ref); err != nil {
		t.Fatal(err)
	}
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

// -----------------------------------------------------------------------------
// §11 failure-injection matrix. Scenario → proof:
//   A crash-before-reservation  → fresh path (TestReceivePoint_MintFreshSessionPerPayment)
//   B crash-before-core         → TestReceivePoint_MintCrashBeforeCreateRecovers
//   C crash-after-core          → TestReceivePoint_MintCrashAfterCreateNoDuplicate
//   D crash-after-persist       → TestReceivePoint_MintReplaysPersistedSuccess (below)
//   E N-concurrent same key     → TestReceivePoint_MintKeyRaceCreatesOneSession
//   F stale-lease reclaim race  → TestReceivePoint_MintStaleLeaseReclaimOneWinner (below)
//   G evicted owner no corrupt  → TestReceivePoint_MintEvictedOwnerCannotCorrupt (below)
//   H fingerprint conflict      → TestReceivePoint_MintFingerprintConflict
//   I cross-payer isolation     → TestReceivePoint_MintCrossPayerNoCollision
// -----------------------------------------------------------------------------

// D — crash-after-persist. A prior process fully completed (row SUCCEEDED with a
// session_id) and this process never touched it. The retry must replay the exact
// persisted session and create NOTHING — no create, no lease write.
func TestReceivePoint_MintReplaysPersistedSuccess(t *testing.T) {
	ctx := context.Background()
	svc, pool, m, primaryAcc, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()
	// A completed prior operation: its session exists in core and the mint row is
	// terminal SUCCEEDED, lease long gone.
	fp := requestFingerprint(slug, "AOA", 1000)
	ref := "brp_" + uuid.NewString()
	amt := int64(1000)
	prior, _ := fake.Create(ctx, CreatePaymentSessionInput{MerchantID: m, WalletAccountID: primaryAcc, AmountMinor: &amt, Currency: "AOA", Purpose: "GENERIC", ReferenceType: "BUSINESS_RECEIVE_POINT", ReferenceID: ref})
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, core_reference, owner_token, lease_until, state, session_id)
		 VALUES ($1,$2,$3,$4,$5, gen_random_uuid(), now() - interval '1 hour', 'SUCCEEDED', $6)`,
		payer, key, slug, fp, ref, prior.SessionID); err != nil {
		t.Fatal(err)
	}
	createsBefore := fake.creates // 1 (the pre-seeded prior session)
	got, err := svc.MintSession(ctx, fake, payer, slug, key, 1000)
	if err != nil {
		t.Fatalf("replay of a persisted success must not error, got %v", err)
	}
	if got.SessionID != prior.SessionID {
		t.Fatalf("must replay the persisted session %q, got %q", prior.SessionID, got.SessionID)
	}
	if fake.creates != createsBefore {
		t.Fatalf("replaying a terminal SUCCEEDED row must create nothing, creates %d→%d", createsBefore, fake.creates)
	}
}

// F — stale-lease reclaim race. A crashed prior attempt left a PENDING reservation
// with an EXPIRED lease. Many workers now retry the SAME (payer, key) at once: the
// contended path is the atomic reclaim UPDATE ... WHERE lease_until < now(), and
// exactly one worker may win it. All callers converge on one session.
func TestReceivePoint_MintStaleLeaseReclaimOneWinner(t *testing.T) {
	ctx := context.Background()
	svc, pool, _, _, slug := mintFixture(ctx, t)
	fake := &fakeSessions{}
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()
	fp := requestFingerprint(slug, "AOA", 1000)
	ref := "brp_" + uuid.NewString()
	// Pre-seed the crashed attempt: PENDING, expired lease, persisted reference, no
	// session yet. The reclaim path — not the INSERT-ON-CONFLICT path — is contended.
	if _, err := pool.Exec(ctx,
		`INSERT INTO business_receive_point_mints (payer_id, idempotency_key, receive_point_slug, request_fingerprint, core_reference, owner_token, lease_until, state)
		 VALUES ($1,$2,$3,$4,$5, gen_random_uuid(), now() - interval '1 hour', 'PENDING')`,
		payer, key, slug, fp, ref); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make([]*PaymentSession, 8)
	errs := make([]error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i], errs[i] = svc.MintSession(ctx, fake, payer, slug, key, 1000) }(i)
	}
	wg.Wait()
	var sid string
	for i := range results {
		if errs[i] != nil {
			t.Fatalf("reclaim racer %d errored: %v", i, errs[i])
		}
		if sid == "" {
			sid = results[i].SessionID
		} else if results[i].SessionID != sid {
			t.Fatalf("racers diverged: %q vs %q", sid, results[i].SessionID)
		}
	}
	if fake.creates != 1 {
		t.Fatalf("stale-lease reclaim race created %d sessions, want exactly 1", fake.creates)
	}
	// The persisted reference is reused verbatim — reclaim never re-randomises it.
	if len(fake.calls) != 1 || fake.calls[0].ReferenceID != ref {
		t.Fatalf("reclaim must reuse the persisted core_reference %q, got %+v", ref, fake.calls)
	}
}

// gatedSessions is a session engine whose first Create blocks until released, so a
// test can interleave an external lease eviction between this call's Create and its
// success-recording CAS. Models core reference-idempotency like fakeSessions.
type gatedSessions struct {
	mu      sync.Mutex
	byRef   map[string]*PaymentSession
	creates int
	entered chan string // receives the ReferenceID when Create is first entered
	release chan struct{}
	gated   bool
}

func newGatedSessions() *gatedSessions {
	return &gatedSessions{byRef: map[string]*PaymentSession{}, entered: make(chan string, 1), release: make(chan struct{}), gated: true}
}
func (g *gatedSessions) preload(ref string, s *PaymentSession) { g.mu.Lock(); g.byRef[ref] = s; g.mu.Unlock() }
func (g *gatedSessions) Create(_ context.Context, in CreatePaymentSessionInput) (*PaymentSession, error) {
	g.mu.Lock()
	if g.gated {
		g.gated = false
		g.mu.Unlock()
		g.entered <- in.ReferenceID
		<-g.release
		g.mu.Lock()
	}
	defer g.mu.Unlock()
	if s, ok := g.byRef[in.ReferenceID]; ok {
		return s, nil // core idempotency: same reference → same session
	}
	g.creates++
	s := &PaymentSession{SessionID: "sess-" + uuid.NewString(), MerchantID: in.MerchantID, AmountMinor: in.AmountMinor, Status: "CREATED"}
	g.byRef[in.ReferenceID] = s
	return s, nil
}
func (g *gatedSessions) Get(_ context.Context, id string) (*PaymentSession, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, s := range g.byRef {
		if s.SessionID == id {
			return s, nil
		}
	}
	return nil, nil
}
func (g *gatedSessions) List(context.Context, string, string, int) ([]PaymentSession, error) {
	return nil, nil
}
func (g *gatedSessions) GetByInterface(context.Context, string, string) (*PaymentSession, error) {
	return nil, nil
}

// G — evicted owner cannot corrupt. Worker O1 reserves the key and enters Create;
// while it is mid-flight, a reclaimer O2 takes the lease and records its own
// SUCCEEDED session. O1's success-recording CAS (WHERE owner_token=O1) must no-op,
// and O1 must defer to O2's session — no duplicate, no overwrite of the winner.
func TestReceivePoint_MintEvictedOwnerCannotCorrupt(t *testing.T) {
	ctx := context.Background()
	svc, pool, _, _, slug := mintFixture(ctx, t)
	gate := newGatedSessions()
	payer, key := "payer-"+uuid.NewString(), "k-"+uuid.NewString()

	done := make(chan struct{})
	var got *PaymentSession
	var mintErr error
	go func() { defer close(done); got, mintErr = svc.MintSession(ctx, gate, payer, slug, key, 1000) }()

	// O1 has reserved the row and is now blocked inside Create.
	ref := <-gate.entered
	var mintID, o1 string
	if err := pool.QueryRow(ctx,
		`SELECT id, owner_token FROM business_receive_point_mints WHERE payer_id=$1 AND idempotency_key=$2`, payer, key).Scan(&mintID, &o1); err != nil {
		t.Fatal(err)
	}
	// A reclaimer O2 wins the lease and completes: it creates the session for the
	// SAME persisted reference (so cores converge) and records SUCCEEDED.
	winner := &PaymentSession{SessionID: "sess-winner-" + uuid.NewString(), Status: "CREATED"}
	gate.preload(ref, winner) // O1's unblocked Create will now return this too
	o2 := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`UPDATE business_receive_point_mints SET owner_token=$2, state='SUCCEEDED', session_id=$3, lease_until=now()+interval '30 seconds', updated_at=now() WHERE id=$1`,
		mintID, o2, winner.SessionID); err != nil {
		t.Fatal(err)
	}
	close(gate.release) // let O1 finish Create and attempt its CAS

	<-done
	if mintErr != nil {
		t.Fatalf("evicted owner must still return a result, got %v", mintErr)
	}
	if got.SessionID != winner.SessionID {
		t.Fatalf("evicted owner must defer to the winner %q, got %q", winner.SessionID, got.SessionID)
	}
	// The row still reflects the winner — O1's late write did not corrupt it.
	var owner, sid, state string
	if err := pool.QueryRow(ctx,
		`SELECT owner_token, session_id, state FROM business_receive_point_mints WHERE id=$1`, mintID).Scan(&owner, &sid, &state); err != nil {
		t.Fatal(err)
	}
	if owner != o2 || sid != winner.SessionID || state != "SUCCEEDED" {
		t.Fatalf("evicted owner corrupted the row: owner=%q sid=%q state=%q", owner, sid, state)
	}
	if gate.creates != 0 {
		t.Fatalf("both workers shared the persisted reference — no session should be created by the double, got %d", gate.creates)
	}
}

func TestReceivePoint_CoreReferenceIsRandomOpaque(t *testing.T) {
	// §5/§6: the core reference is random and opaque — not derived from any
	// user/client material, ≥128 bits, and never repeats.
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		ref, err := newCoreReference()
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(ref, "brp_") || len(ref) != 4+receivePointSlugLen {
			t.Fatalf("unexpected reference shape: %q", ref)
		}
		if seen[ref] {
			t.Fatal("core references must not repeat")
		}
		seen[ref] = true
	}
	// 22 base62 chars ≈ 131 bits of entropy — comfortably ≥ 128.
	if receivePointSlugLen < 22 {
		t.Fatalf("insufficient entropy: %d chars", receivePointSlugLen)
	}
}
