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

// fakeSessions is a PaymentSessionService test double: it captures every Create
// input and returns a fresh session id per call (proving fresh-session-per-payment
// without a running core, per §35).
type fakeSessions struct {
	calls []CreatePaymentSessionInput
	n     int
}

func (f *fakeSessions) Create(_ context.Context, in CreatePaymentSessionInput) (*PaymentSession, error) {
	f.calls = append(f.calls, in)
	f.n++
	return &PaymentSession{SessionID: "sess-" + uuid.NewString(), MerchantID: in.MerchantID, WalletAccountID: in.WalletAccountID, AmountMinor: in.AmountMinor, Status: "CREATED"}, nil
}
func (f *fakeSessions) Get(context.Context, string) (*PaymentSession, error) { return nil, nil }
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
	_, err := pool.Exec(ctx, `INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`,
		"loja"+merchantID[:8], merchantID)
	if err != nil {
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
		`SELECT wa.id::text FROM wallet_accounts wa JOIN wallets w ON w.id=wa.wallet_id
		  WHERE w.merchant_id=$1 AND wa.purpose='PRIMARY'`, merchantID).Scan(&primaryAccountID); err != nil {
		t.Fatalf("primary account (trigger): %v", err)
	}
	return merchantID, primaryAccountID
}

func TestReceivePoint_MintFreshSessionPerPayment(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m, primaryAcc := seedReceivableBusiness(ctx, t, pool)
	rp, err := svc.EnsureActive(ctx, m, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeSessions{}

	a, err := svc.MintSession(ctx, fake, rp.PublicSlug, 1000)
	if err != nil {
		t.Fatalf("mint A: %v", err)
	}
	b, err := svc.MintSession(ctx, fake, rp.PublicSlug, 2500)
	if err != nil {
		t.Fatalf("mint B: %v", err)
	}
	// Two intentional payments → two distinct fresh sessions; the point is reused.
	if a.SessionID == b.SessionID {
		t.Fatal("same session reused across payments — must be fresh per payment")
	}
	if len(fake.calls) != 2 {
		t.Fatalf("want 2 Create calls, got %d", len(fake.calls))
	}
	for i, c := range fake.calls {
		// Payee is SERVER-resolved from the slug — the caller never chose it.
		if c.MerchantID != m || c.WalletAccountID != primaryAcc {
			t.Fatalf("call %d payee not server-resolved: %+v", i, c)
		}
		if c.ReferenceType != "BUSINESS_RECEIVE_POINT" || c.ReferenceID != rp.PublicSlug {
			t.Fatalf("call %d reference wrong: %+v", i, c)
		}
	}
	if *fake.calls[0].AmountMinor != 1000 || *fake.calls[1].AmountMinor != 2500 {
		t.Fatal("amounts not threaded")
	}
}

func TestReceivePoint_MintFailsClosedWhenIneligible(t *testing.T) {
	ctx := context.Background()
	pool := rpPoolOrSkip(ctx, t)
	svc := NewBusinessReceivePointService(pool)
	m, _ := seedReceivableBusiness(ctx, t, pool)
	rp, _ := svc.EnsureActive(ctx, m, "SANDBOX")
	if _, err := pool.Exec(ctx, `UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, m); err != nil {
		t.Fatal(err)
	}
	fake := &fakeSessions{}
	if _, err := svc.MintSession(ctx, fake, rp.PublicSlug, 1000); !errors.Is(err, ErrReceivePointIneligible) {
		t.Fatalf("suspended business mint must fail closed, got %v", err)
	}
	if len(fake.calls) != 0 {
		t.Fatal("no session may be created for an ineligible business")
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
