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
    >,
    ledger: Arc<PostgresLedgerRepository>,
    merchant_id: MerchantId,
    wallet_id: WalletId,
    bank_id: AccountId,
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

    // Payout engine.
    let wallet_repo_for_payout = PostgresWalletRepository::new(pool.clone());
    let payout_repo = PostgresPayoutRepository::new(pool);
    let payout_engine =
        PostgresPayoutEngine::new(wallet_repo_for_payout, ledger.clone(), payout_repo, bank.id);

    TestFixture {
        payout_engine,
        ledger,
        merchant_id,
        wallet_id: wallet.id,
        bank_id: bank.id,
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

    // Ledger entry posted: bank account credited (funds earmarked to leave).
    let bank_balance_after = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance_after.amount_minor().abs(),
        50_000_000,
        "bank account must be adjusted at process time"
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
