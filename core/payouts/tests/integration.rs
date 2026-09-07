// Integration tests for banzami-payouts.
//
// These are the most critical integration tests in the codebase — they verify
// that the ledger reversal logic is correct under all failure scenarios.
// A bug here means real money is either lost or double-counted.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-payouts --test integration

use sqlx::PgPool;
use std::sync::Arc;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_payouts::{
    BankDestination, CreatePayoutRequest, PayoutEngine, PayoutStatus, PostgresPayoutEngine,
    PostgresPayoutRepository,
};
use banzami_types::{AccountId, Currency, MerchantId, Money, WalletId};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, ReserveRequest,
    SettleRequest, WalletEngine,
};

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

fn destination() -> BankDestination {
    BankDestination {
        account_number: "123456789".into(),
        bank_code: "BFA".into(),
        account_holder_name: "Test Merchant Lda".into(),
    }
}

struct TestFixture {
    payout_engine: PostgresPayoutEngine<
        PostgresWalletRepository,
        PostgresLedgerRepository,
        PostgresPayoutRepository,
        banzami_pricing::PostgresPricingRuleProvider,
    >,
    ledger: Arc<PostgresLedgerRepository>,
    merchant_id: MerchantId,
    wallet_id: WalletId,
    bank_id: AccountId,
    operator_fee_id: AccountId,
    pool: PgPool,
}

/// The withdrawal rate the migrations seeded, read rather than restated.
///
/// Migration 0108 makes the Sandbox withdrawal rule a repository fact so a
/// financial reset cannot silently make withdrawals free (REPAIR_LOG RA-063).
/// A test that hard-coded the number would have to be edited to match a policy
/// change rather than following it, and would go quiet in exactly the case that
/// matters: a rule that vanished.
async fn seeded_withdrawal_bps(pool: &PgPool) -> i64 {
    sqlx::query_scalar::<_, i32>(
        "SELECT rate_bps FROM pricing_rules
          WHERE environment = 'SANDBOX' AND enabled
            AND pricing_operation = 'PAYOUT'
            AND pricing_profile = 'sandbox-default'
            AND effective_to IS NULL",
    )
    .fetch_one(pool)
    .await
    .expect("the Sandbox PAYOUT rule for sandbox-default must exist — 0110 seeds it") as i64
}

async fn setup(pool: PgPool) -> TestFixture {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));

    // System accounts.
    let bank = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "bank-payout-test",
            Currency::AOA,
        ))
        .await
        .unwrap();

    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-payout-test",
            Currency::AOA,
        ))
        .await
        .unwrap();

    // Wallet engine — needed to create a wallet with real available_account_id/reserved_account_id.
    let wallet_repo_for_engine = PostgresWalletRepository::new(pool.clone());
    let wallet_engine = PostgresWalletEngine::new(ledger.clone(), wallet_repo_for_engine);
    let merchant_id = MerchantId::new();

    // The merchant carries an assigned pricing profile, because in production it
    // must: PAYOUT rules are per-profile now, and a rule pinned to a profile
    // cannot price an owner that has none.
    //
    // The fixture used to create a bare MerchantId with no row and no profile,
    // which worked while one network-wide withdrawal rule priced everyone. It
    // stopped working the moment that rule was superseded — the fee resolved to
    // zero and the bank leg carried the gross. Which is the resolver being right
    // and the fixture describing a state production does not allow.
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status, pricing_profile_id)
         SELECT $1, 'Payout fixture', $2, 'ACTIVE', p.id
           FROM pricing_profiles p
          WHERE p.environment = 'SANDBOX' AND p.code = 'sandbox-default'",
    )
    .bind(merchant_id.as_uuid())
    .bind(format!(
        "payout-fixture-{}@projects.banzami.test",
        merchant_id.as_uuid()
    ))
    .execute(&pool)
    .await
    .unwrap();

    let wallet = wallet_engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    // Fund the wallet: reserve then settle to give the merchant available balance.
    wallet_engine
        .reserve(ReserveRequest {
            idempotency_key: "setup-reserve".into(),
            wallet_id: wallet.id,
            amount: kz(100_000_000),
            from_account_id: transit.id,
        })
        .await
        .unwrap();
    wallet_engine
        .settle(SettleRequest {
            idempotency_key: "setup-settle".into(),
            wallet_id: wallet.id,
            amount: kz(100_000_000),
            operator_fee: None,
            operator_fee_account_id: None,
        })
        .await
        .unwrap();

    // Payout engine, priced by whatever rule the migrations seeded. These
    // lifecycle tests assert transitions, not a rate, so they read the rate from
    // the database rather than restating it — a test that hard-codes 75 bps
    // would have to be edited to match a policy change instead of following it.
    // The operator-fee account is a REAL ledger account now.
    //
    // It used to be a throwaway AccountId::new() with the note "unused while
    // fee == 0", and the note above it said "no wallet_withdrawal rule exists in
    // the test DB, so the fee resolves to 0". Migration 0108 seeds that rule
    // durably — precisely so a Sandbox reset cannot make withdrawals free again
    // — so the fee is no longer zero, the posting is no longer two legs, and an
    // id with no account behind it now fails with AccountNotFound.
    let operator_fee = ledger
        .create_account(Account::new(
            AccountType::Revenue,
            "operator-fee-payout-test",
            Currency::AOA,
        ))
        .await
        .unwrap();
    let operator_fee_id = operator_fee.id;
    let wallet_repo_for_payout = PostgresWalletRepository::new(pool.clone());
    let pricing = std::sync::Arc::new(banzami_pricing::PostgresPricingRuleProvider::new(
        pool.clone(),
    ));
    let payout_repo = PostgresPayoutRepository::new(pool.clone());
    let payout_engine = PostgresPayoutEngine::new(
        wallet_repo_for_payout,
        ledger.clone(),
        payout_repo,
        bank.id,
        pricing,
        operator_fee_id,
        "SANDBOX",
    );

    TestFixture {
        payout_engine,
        ledger,
        merchant_id,
        wallet_id: wallet.id,
        bank_id: bank.id,
        operator_fee_id,
        pool,
    }
}

// ─── Happy path ──────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn initiate_to_confirmed_happy_path(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let payout = fix
        .payout_engine
        .initiate(CreatePayoutRequest {
            idempotency_key: "payout-happy-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            amount: kz(50_000_000),
            destination: destination(),
        })
        .await
        .unwrap();

    assert_eq!(payout.status, PayoutStatus::Pending);

    // No ledger entry yet.
    let bank_balance_before = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance_before.amount_minor(),
        0,
        "no ledger entry before process"
    );

    let processing = fix.payout_engine.process(payout.id).await.unwrap();
    assert_eq!(processing.status, PayoutStatus::Processing);
    assert!(
        processing.ledger_posting_id.is_some(),
        "processing must record a posting ID"
    );

    // Ledger entry posted: the bank leg carries the NET, and the operator fee is
    // its own paired posting rather than a third leg on this one (ADR-031).
    //
    // This asserted a flat 50_000_000 while no withdrawal rule existed. That was
    // not a fee-agnostic assertion, it was an assertion that the fee was zero —
    // which is the state migration 0108 exists to make impossible.
    let gross = 50_000_000i64;
    let bps = seeded_withdrawal_bps(&fix.pool).await;
    let fee = gross * bps / 10_000;
    assert!(fee > 0, "a seeded withdrawal rule must charge something");

    let bank_balance_after = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance_after.amount_minor().abs(),
        gross - fee,
        "the bank leg must carry the net, not the gross"
    );
    let fee_balance = fix.ledger.balance(fix.operator_fee_id).await.unwrap();
    assert_eq!(
        fee_balance.amount_minor().abs(),
        fee,
        "the operator fee must be posted, and posted separately"
    );

    let sent = fix.payout_engine.mark_sent(payout.id).await.unwrap();
    assert_eq!(sent.status, PayoutStatus::Sent);

    let confirmed = fix.payout_engine.confirm(payout.id).await.unwrap();
    assert_eq!(confirmed.status, PayoutStatus::Confirmed);

    Ok(())
}

// ─── Failure with reversal ───────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fail_from_processing_reverses_ledger_entry(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let payout = fix
        .payout_engine
        .initiate(CreatePayoutRequest {
            idempotency_key: "payout-fail-proc-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            amount: kz(30_000_000),
            destination: destination(),
        })
        .await
        .unwrap();

    fix.payout_engine.process(payout.id).await.unwrap();

    // Confirm the ledger was updated.
    let balance_after_process = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_ne!(
        balance_after_process.amount_minor(),
        0,
        "ledger changed at process"
    );

    // Fail: must reverse the ledger entry.
    let failed = fix
        .payout_engine
        .fail(payout.id, "bank transfer rejected".into())
        .await
        .unwrap();
    assert_eq!(failed.status, PayoutStatus::Failed);

    // Ledger reversal: bank account returns to zero.
    let balance_after_fail = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        balance_after_fail.amount_minor(),
        0,
        "ledger must be reversed — bank balance back to zero after fail"
    );

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn mark_returned_from_sent_reverses_ledger_entry(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let payout = fix
        .payout_engine
        .initiate(CreatePayoutRequest {
            idempotency_key: "payout-returned-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            amount: kz(20_000_000),
            destination: destination(),
        })
        .await
        .unwrap();

    fix.payout_engine.process(payout.id).await.unwrap();
    fix.payout_engine.mark_sent(payout.id).await.unwrap();

    // Bank returns the transfer.
    let returned = fix.payout_engine.mark_returned(payout.id).await.unwrap();
    assert_eq!(returned.status, PayoutStatus::Returned);

    // Ledger reversal: funds back to zero on bank account.
    let bank_balance = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance.amount_minor(),
        0,
        "bank balance must be zero after funds returned by bank"
    );

    Ok(())
}

// ─── Fail from PENDING — no ledger entry ─────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fail_from_pending_writes_no_ledger_entry(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let payout = fix
        .payout_engine
        .initiate(CreatePayoutRequest {
            idempotency_key: "payout-fail-pending-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            amount: kz(10_000_000),
            destination: destination(),
        })
        .await
        .unwrap();

    // Fail before processing — no ledger entry should ever be written.
    let failed = fix
        .payout_engine
        .fail(payout.id, "cancelled before processing".into())
        .await
        .unwrap();
    assert_eq!(failed.status, PayoutStatus::Failed);
    assert!(
        failed.ledger_posting_id.is_none(),
        "no posting ID — ledger was never touched"
    );

    let bank_balance = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance.amount_minor(),
        0,
        "no ledger entry on fail from PENDING"
    );

    Ok(())
}

/// A completed payout explains its own price.
///
/// Before this, `payouts` held `amount_minor` and nothing else. Explaining a
/// withdrawal meant joining to `ledger_postings` on a derived idempotency key
/// (`<key>:process:fee`) — which is literally how the RA-063 incident was
/// reconstructed, and not a reasonable way to answer "which rule priced this".
#[sqlx::test(migrations = "../../db/migrations")]
async fn processed_payout_persists_its_pricing_decision(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;
    let gross = 50_000_000i64;

    let payout = fix
        .payout_engine
        .initiate(CreatePayoutRequest {
            idempotency_key: "payout-snapshot-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            amount: kz(gross),
            destination: destination(),
        })
        .await
        .unwrap();
    fix.payout_engine.process(payout.id).await.unwrap();

    /// The pricing snapshot as it is stored: fee, net, rule, version, rate, and
    /// when it was decided.
    type Snapshot = (
        Option<i64>,
        Option<i64>,
        Option<uuid::Uuid>,
        Option<i32>,
        Option<i32>,
        Option<chrono::DateTime<chrono::Utc>>,
    );

    let row: Snapshot = sqlx::query_as(
        "SELECT fee_minor, net_minor, pricing_rule_id, pricing_rule_version,
                    pricing_rate_bps, pricing_decided_at
               FROM payouts WHERE id = $1",
    )
    .bind(payout.id.as_uuid())
    .fetch_one(&fix.pool)
    .await
    .unwrap();

    let bps = seeded_withdrawal_bps(&fix.pool).await;
    let expected_fee = gross * bps / 10_000;

    assert_eq!(
        row.0,
        Some(expected_fee),
        "the fee is recorded on the payout"
    );
    assert_eq!(row.1, Some(gross - expected_fee), "and so is the net");
    assert!(row.2.is_some(), "the rule that priced it is identified");
    assert_eq!(row.3, Some(1), "with its version");
    assert_eq!(row.4, Some(bps as i32), "and the rate it applied");
    assert!(row.5.is_some(), "and when the decision was made");
    Ok(())
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn duplicate_initiate_returns_existing_payout(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let make_req = || CreatePayoutRequest {
        idempotency_key: "payout-idem-01".into(),
        merchant_id: fix.merchant_id,
        wallet_id: fix.wallet_id,
        amount: kz(15_000_000),
        destination: destination(),
    };

    let first = fix.payout_engine.initiate(make_req()).await.unwrap();
    let second = fix.payout_engine.initiate(make_req()).await.unwrap();

    assert_eq!(
        first.id, second.id,
        "duplicate initiate must return the same payout"
    );

    Ok(())
}
