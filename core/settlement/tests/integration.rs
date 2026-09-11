// Integration tests for banzami-settlement.
//
// Verifies the full settlement lifecycle against a real PostgreSQL database,
// including the ledger posting that is created at confirmation.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-settlement --test integration

use chrono::Utc;
use sqlx::PgPool;
use std::sync::Arc;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_settlement::{
    CreateSettlementBatchRequest, PostgresSettlementEngine, PostgresSettlementRepository,
    SettlementEngine, SettlementStatus,
};
use banzami_types::{Currency, MerchantId, Money, WalletId};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, WalletEngine,
};

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

struct TestFixture {
    engine: PostgresSettlementEngine<PostgresLedgerRepository, PostgresSettlementRepository>,
    ledger: Arc<PostgresLedgerRepository>,
    merchant_id: MerchantId,
    wallet_id: WalletId,
    bank_id: banzami_types::AccountId,
    #[allow(dead_code)]
    transit_id: banzami_types::AccountId,
}

async fn setup(pool: PgPool) -> TestFixture {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));

    // System accounts needed by the settlement engine.
    let bank = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "bank-settlement-test",
            Currency::AOA,
        ))
        .await
        .unwrap();
    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-settlement-test",
            Currency::AOA,
        ))
        .await
        .unwrap();

    // Wallet is required because settlements has a FK on wallets(id).
    let wallet_repo = PostgresWalletRepository::new(pool.clone());
    let wallet_engine = PostgresWalletEngine::new(ledger.clone(), wallet_repo);
    let merchant_id = MerchantId::new();
    let wallet = wallet_engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    let settlement_repo = PostgresSettlementRepository::new(pool);
    let engine =
        PostgresSettlementEngine::new(ledger.clone(), settlement_repo, bank.id, transit.id);

    TestFixture {
        engine,
        ledger,
        merchant_id,
        wallet_id: wallet.id,
        bank_id: bank.id,
        transit_id: transit.id,
    }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn full_lifecycle_pending_to_settled(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let batch = fix
        .engine
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: "settle-lifecycle-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            gross_amount: kz(100_000_000),
            fee_amount: kz(3_000_000),
            transaction_count: 120,
            period_start: Utc::now() - chrono::Duration::days(7),
            period_end: Utc::now(),
        })
        .await
        .unwrap();

    assert_eq!(batch.status, SettlementStatus::Pending);
    assert_eq!(batch.net_amount.amount_minor(), 97_000_000);

    let submitted = fix.engine.submit(batch.id).await.unwrap();
    assert_eq!(submitted.status, SettlementStatus::Submitted);

    let settled = fix.engine.confirm(batch.id).await.unwrap();
    assert_eq!(settled.status, SettlementStatus::Settled);

    // A ledger posting must exist: DR bank / CR transit for net_amount.
    let bank_balance = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance.amount_minor(),
        97_000_000,
        "bank account must be debited for the net settlement amount"
    );

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn confirmation_is_idempotent(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let batch = fix
        .engine
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: "settle-idem-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            gross_amount: kz(50_000_000),
            fee_amount: kz(1_500_000),
            transaction_count: 60,
            period_start: Utc::now() - chrono::Duration::days(1),
            period_end: Utc::now(),
        })
        .await
        .unwrap();

    fix.engine.submit(batch.id).await.unwrap();
    fix.engine.confirm(batch.id).await.unwrap();

    // Confirming again must not double-post the ledger.
    let result = fix.engine.confirm(batch.id).await;
    // Should fail (already SETTLED, invalid transition) — not silently double-post.
    assert!(
        result.is_err(),
        "confirming a SETTLED batch must be an error"
    );

    let bank_balance = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance.amount_minor(),
        48_500_000,
        "ledger posted once only"
    );

    Ok(())
}

// ─── Validation ──────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_exceeds_gross_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let result = fix
        .engine
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: "settle-bad-fee-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            gross_amount: kz(10_000_000),
            fee_amount: kz(10_000_100), // fee > gross
            transaction_count: 10,
            period_start: Utc::now() - chrono::Duration::days(1),
            period_end: Utc::now(),
        })
        .await;

    assert!(
        result.is_err(),
        "creating a batch with fee > gross must fail"
    );

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fail_from_pending_leaves_no_ledger_entry(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;

    let batch = fix
        .engine
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: "settle-fail-01".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            gross_amount: kz(20_000_000),
            fee_amount: kz(600_000),
            transaction_count: 20,
            period_start: Utc::now() - chrono::Duration::days(3),
            period_end: Utc::now(),
        })
        .await
        .unwrap();

    fix.engine
        .fail(batch.id, "acquirer rejected batch".into())
        .await
        .unwrap();

    // No funds ever moved — bank balance must be zero.
    let bank_balance = fix.ledger.balance(fix.bank_id).await.unwrap();
    assert_eq!(
        bank_balance.amount_minor(),
        0,
        "no ledger entry on fail from PENDING"
    );

    Ok(())
}

// A confirm racing a fail: exactly one wins, and the ledger agrees with it —
// never a FAILED batch with the confirmation posted, or SETTLED without it.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_confirm_racing_a_fail_leaves_ledger_and_status_agreeing(
    pool: PgPool,
) -> sqlx::Result<()> {
    let fix = setup(pool).await;
    let mut settled_net = 0i64;
    for round in 0..8 {
        let batch = fix
            .engine
            .create_batch(CreateSettlementBatchRequest {
                idempotency_key: format!("settle-race-{round}"),
                merchant_id: fix.merchant_id,
                wallet_id: fix.wallet_id,
                gross_amount: kz(1_000_000),
                fee_amount: kz(30_000),
                transaction_count: 1,
                period_start: Utc::now() - chrono::Duration::days(1),
                period_end: Utc::now(),
            })
            .await
            .unwrap();
        fix.engine.submit(batch.id).await.unwrap();
        let (c, f) = tokio::join!(
            fix.engine.confirm(batch.id),
            fix.engine.fail(batch.id, "acquirer rejected".into())
        );
        assert_eq!(
            c.is_ok() as u8 + f.is_ok() as u8,
            1,
            "round {round}: exactly one may win"
        );
        let status = fix.engine.get(batch.id).await.unwrap().status;
        if status == SettlementStatus::Settled {
            settled_net += 970_000;
        } else {
            assert_eq!(status, SettlementStatus::Failed, "round {round}");
        }
        let bank = fix.ledger.balance(fix.bank_id).await.unwrap();
        assert_eq!(
            bank.amount_minor(),
            settled_net,
            "round {round}: the ledger disagrees with the batch status"
        );
    }
    Ok(())
}

// Gross positive, fee not negative, something left to settle. `fee <= gross`
// alone accepted gross -100 / fee -200 as a +100 settlement.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_batch_settles_a_positive_net_only(pool: PgPool) -> sqlx::Result<()> {
    let fix = setup(pool).await;
    for (i, (gross, fee)) in [(-100, -200), (0, 0), (1_000, -1), (1_000, 1_000), (-5, 0)]
        .into_iter()
        .enumerate()
    {
        let r = fix
            .engine
            .create_batch(CreateSettlementBatchRequest {
                idempotency_key: format!("settle-bad-amount-{i}"),
                merchant_id: fix.merchant_id,
                wallet_id: fix.wallet_id,
                gross_amount: kz(gross),
                fee_amount: kz(fee),
                transaction_count: 1,
                period_start: Utc::now() - chrono::Duration::days(1),
                period_end: Utc::now(),
            })
            .await;
        assert!(r.is_err(), "gross {gross} / fee {fee} must be refused");
    }
    let ok = fix
        .engine
        .create_batch(CreateSettlementBatchRequest {
            idempotency_key: "settle-good-amount".into(),
            merchant_id: fix.merchant_id,
            wallet_id: fix.wallet_id,
            gross_amount: kz(1_000),
            fee_amount: kz(0),
            transaction_count: 1,
            period_start: Utc::now() - chrono::Duration::days(1),
            period_end: Utc::now(),
        })
        .await;
    assert!(ok.is_ok(), "a fee-free positive batch is valid");
    Ok(())
}
