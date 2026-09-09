package service

// The wallet a Business owns, resolved from its owner rather than from a public
// profile that a self-service Business never has.
//
// GET /v1/integration read `wallets` only through `merchant_profiles.wallet_id`.
// That row is written by the @handle onboarding flow and by nothing else, so a
// Business provisioned through the Developer Platform's own Financial Setup had
// no profile — and the endpoint reported no wallet, no primary account, and
// WALLET_MISSING as a settlement blocker, while Core held an ACTIVE wallet with
// a PRIMARY account and payments were settling into it.
//
// The DOA reference application's integration health view showed exactly that:
// "Carteira: em falta", "@doa não tem uma carteira ativa" — an application
// reporting itself broken while working. 244 merchants hold a wallet with no
// profile row, including every Sandbox owner the Developer Platform provisions.

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func selfPoolOrSkip(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed business self tests")
	}
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("connect: %v", err)
	}
	return pool
}

// A Business exactly as Developer Financial Setup provisions one: merchant +
// wallet + the PRIMARY account Core's trigger creates. No merchant_profiles row,
// because nothing on that path writes one.
func seedSelfServiceOwner(ctx context.Context, t *testing.T, pool *pgxpool.Pool) (merchant, wallet string) {
	t.Helper()
	m := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchants (id, name, email, status) VALUES ($1,$2,$3,'ACTIVE')`,
		m, "Sandbox · SelfServe", "selfserve-"+m[:8]+"@projects.banzami.test"); err != nil {
		t.Skipf("cannot seed merchant: %v", err)
	}
	acct := func() string {
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO ledger_accounts (id, account_type, name, currency)
			 VALUES (gen_random_uuid(),'LIABILITY','a','AOA') RETURNING id::text`).Scan(&id); err != nil {
			t.Fatalf("ledger account: %v", err)
		}
		return id
	}
	w := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
		 VALUES ($1,$2,'AOA','ACTIVE',$3,$4)`, w, m, acct(), acct()); err != nil {
		t.Fatalf("wallet: %v", err)
	}
	return m, w
}

func TestSelf_ResolvesTheWalletTheMerchantOwns(t *testing.T) {
	ctx := context.Background()
	pool := selfPoolOrSkip(t)
	defer pool.Close()
	svc := &BusinessSelfService{pool: pool}

	merchant, wallet := seedSelfServiceOwner(ctx, t, pool)

	var profiles int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM merchant_profiles WHERE merchant_id = $1`, merchant).Scan(&profiles); err != nil {
		t.Fatalf("profile count: %v", err)
	}
	if profiles != 0 {
		t.Fatalf("fixture has %d profile rows — it must reproduce a self-service owner, which has none", profiles)
	}

	res, err := svc.Self(ctx, merchant, "SANDBOX", "")
	if err != nil {
		t.Fatalf("Self: %v", err)
	}

	if res.WalletID != wallet {
		t.Fatalf("wallet_id = %q, want the wallet the merchant owns (%q) — resolving only through "+
			"merchant_profiles reports a working Business as having none", res.WalletID, wallet)
	}
	if res.WalletStatus != "ACTIVE" {
		t.Errorf("wallet_status = %q, want ACTIVE", res.WalletStatus)
	}
	if res.WalletCurrency != "AOA" {
		t.Errorf("wallet_currency = %q, want AOA", res.WalletCurrency)
	}
	// The handle lives in handle_registry, which is what a payment resolves a
	// named party through. Reading it only from the public profile left a
	// self-service Business unable to discover the @banza it settles by.
	if _, err := pool.Exec(ctx,
		`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`,
		"p"+merchant[:12], merchant); err == nil {
		again, aerr := svc.Self(ctx, merchant, "SANDBOX", "")
		if aerr != nil {
			t.Fatalf("Self after handle: %v", aerr)
		}
		if again.Handle != "p"+merchant[:12] {
			t.Errorf("handle = %q, want the registered @banza — a developer who cannot "+
				"discover their own handle cannot name themselves as a settlement party", again.Handle)
		}
	}
	if res.PrimaryAccountID == "" {
		t.Error("no PRIMARY account resolved — the wallet trigger creates one with every wallet")
	}
	if !res.WalletReady {
		t.Error("wallet_ready is false for an ACTIVE wallet with a PRIMARY account")
	}
	for _, b := range res.Blockers {
		if b == BlockerWalletMissing || b == BlockerWalletAccountMissing {
			t.Errorf("blocker %q raised against a Business whose wallet is ACTIVE and has a PRIMARY "+
				"account — a false blocker is worse than none, it tells an integrator to stop", b)
		}
	}
}

// KYB is a genuine settlement blocker (ADR-028 validates it), so it must still
// be reported. Fixing the wallet must not quietly clear an unrelated, true one.
func TestSelf_StillReportsTheBlockersThatAreReal(t *testing.T) {
	ctx := context.Background()
	pool := selfPoolOrSkip(t)
	defer pool.Close()
	svc := &BusinessSelfService{pool: pool}

	merchant, _ := seedSelfServiceOwner(ctx, t, pool)
	res, err := svc.Self(ctx, merchant, "SANDBOX", "")
	if err != nil {
		t.Fatalf("Self: %v", err)
	}
	var kyb, pricing bool
	for _, b := range res.Blockers {
		if b == BlockerKybNotApproved {
			kyb = true
		}
		if b == BlockerPricingMissing {
			pricing = true
		}
	}
	if !kyb {
		t.Error("KYB is not APPROVED and no blocker was raised — settlement validates it (ADR-028)")
	}
	if !pricing {
		t.Error("no pricing profile is assigned and no blocker was raised — the resolver refuses " +
			"rather than charging zero")
	}
	if res.SettlementReady {
		t.Error("settlement_ready is true while real blockers stand")
	}
}

// A merchant whose public profile deliberately names a wallet keeps that answer:
// the owner's wallet is a fallback, not an override.
func TestSelf_TheProfilesWalletStillWinsWhenSet(t *testing.T) {
	ctx := context.Background()
	pool := selfPoolOrSkip(t)
	defer pool.Close()
	svc := &BusinessSelfService{pool: pool}

	merchant, first := seedSelfServiceOwner(ctx, t, pool)
	// wallets is UNIQUE(merchant_id, currency), so a second wallet means a second
	// currency. The profile points at THAT one.
	acct := func() string {
		var id string
		_ = pool.QueryRow(ctx,
			`INSERT INTO ledger_accounts (id, account_type, name, currency)
			 VALUES (gen_random_uuid(),'LIABILITY','b','USD') RETURNING id::text`).Scan(&id)
		return id
	}
	second := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
		 VALUES ($1,$2,'USD','ACTIVE',$3,$4)`, second, merchant, acct(), acct()); err != nil {
		t.Skipf("a second-currency wallet is not permitted here: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO merchant_profiles (merchant_id, handle, display_name, wallet_id)
		 VALUES ($1,$2,'Named',$3)`, merchant, "h"+merchant[:8], second); err != nil {
		t.Skipf("merchant_profiles shape differs: %v", err)
	}

	res, err := svc.Self(ctx, merchant, "SANDBOX", "")
	if err != nil {
		t.Fatalf("Self: %v", err)
	}
	if res.WalletID != second {
		t.Fatalf("wallet_id = %q, want the profile's wallet %q (the owner's oldest was %q) — the "+
			"fallback must not override a deliberate choice", res.WalletID, second, first)
	}
}

// A fee destination is a DESTINATION, not the caller's identity.
//
// The DOA integration showed "integração com problemas" because a local setting
// expected @doa while the Project key resolved @p1a5f17b3cc7e, and the two were
// compared as though they were one thing. They are three separate identities in
// an application settlement — the Project's own, the platform fee destination,
// and the campaign beneficiary — and all three may legitimately differ.
//
// What matters is whether the destination can RECEIVE the fee. Each condition
// ADR-028 requires gets its own answer, so an operator learns which one failed.
func TestSelf_FeeDestinationIsCheckedAsADestination(t *testing.T) {
	ctx := context.Background()
	pool := selfPoolOrSkip(t)
	defer pool.Close()
	svc := &BusinessSelfService{pool: pool}

	caller, _ := seedSelfServiceOwner(ctx, t, pool)

	t.Run("absent unless asked about", func(t *testing.T) {
		res, err := svc.Self(ctx, caller, "SANDBOX", "")
		if err != nil {
			t.Fatalf("Self: %v", err)
		}
		if res.FeeDestination != nil {
			t.Error("a fee destination was reported although none was asked about")
		}
	})

	t.Run("an unregistered handle is not found, not 'broken integration'", func(t *testing.T) {
		res, _ := svc.Self(ctx, caller, "SANDBOX", "@nobody-here-at-all")
		if res.FeeDestination == nil || res.FeeDestination.Resolved {
			t.Fatalf("expected an unresolved destination, got %+v", res.FeeDestination)
		}
		if res.FeeDestination.Blocker != "FEE_DESTINATION_NOT_FOUND" {
			t.Errorf("blocker = %q, want FEE_DESTINATION_NOT_FOUND", res.FeeDestination.Blocker)
		}
	})

	t.Run("a destination owned by somebody else says so precisely", func(t *testing.T) {
		other, _ := seedSelfServiceOwner(ctx, t, pool)
		h := "other" + other[:8]
		if _, err := pool.Exec(ctx,
			`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`,
			h, other); err != nil {
			t.Skipf("cannot register: %v", err)
		}
		res, _ := svc.Self(ctx, caller, "SANDBOX", "@"+h)
		fd := res.FeeDestination
		if fd == nil || !fd.Resolved {
			t.Fatalf("destination did not resolve: %+v", fd)
		}
		if fd.OwnedByCaller {
			t.Error("a destination belonging to another merchant was reported as owned by the caller")
		}
		if fd.Blocker != "FEE_DESTINATION_NOT_OWNED" {
			t.Errorf("blocker = %q, want FEE_DESTINATION_NOT_OWNED — this is the condition "+
				"an integrator can act on, and it must not hide behind a generic error", fd.Blocker)
		}
		// Another party's compliance state is not the caller's business.
		if fd.KybApproved {
			t.Error("a stranger's KYB state was disclosed")
		}
	})

	t.Run("the caller's own account is checked through to type and KYB", func(t *testing.T) {
		h := "self" + caller[:8]
		if _, err := pool.Exec(ctx,
			`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`,
			h, caller); err != nil {
			t.Skipf("cannot register: %v", err)
		}
		res, _ := svc.Self(ctx, caller, "SANDBOX", "@"+h)
		fd := res.FeeDestination
		if fd == nil || !fd.OwnedByCaller {
			t.Fatalf("the caller's own handle was not recognised as owned: %+v", fd)
		}
		// A plain MERCHANT may not take an application fee (ADR-028), and this
		// fixture has no compliance record — so the first unmet condition is
		// reported, not a verdict.
		if fd.Ready {
			t.Error("a MERCHANT with no KYB was reported ready to take an application fee")
		}
		if fd.Blocker == "" {
			t.Error("not ready, and no reason given")
		}
	})

	t.Run("an unready destination is not a blocker on the Business itself", func(t *testing.T) {
		res, _ := svc.Self(ctx, caller, "SANDBOX", "@nobody-here-at-all")
		for _, b := range res.Blockers {
			if strings.Contains(b, "FEE_DESTINATION") {
				t.Errorf("%q leaked into the account's own blockers — a settlement that "+
					"charges no fee needs no destination at all", b)
			}
		}
	})
}
