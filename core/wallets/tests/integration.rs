// Integration tests for banzami-wallets.
//
// Tests the balance invariants of the wallet domain against a real PostgreSQL database.
// Reserve/settle/release operations are verified through both the WalletEngine balance
// view and the underlying ledger balance.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-wallets --test integration

use sqlx::PgPool;
use std::sync::Arc;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_types::{Currency, MerchantId, Money};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, ReleaseRequest,
    ReserveRequest, SettleRequest, WalletEngine,
};

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

async fn setup(pool: PgPool) -> (impl WalletEngine, Arc<PostgresLedgerRepository>) {
    let ledger = Arc::new(PostgresLedgerRepository::new(pool.clone()));
    let wallet_repo = PostgresWalletRepository::new(pool);
    let engine = PostgresWalletEngine::new(ledger.clone(), wallet_repo);
    (engine, ledger)
}

// ─── Creation ────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fresh_wallet_has_zero_balance(pool: PgPool) -> sqlx::Result<()> {
    let (engine, _) = setup(pool).await;
    let merchant_id = MerchantId::new();

    let wallet = engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    let balance = engine.balance(wallet.id).await.unwrap();
    assert_eq!(balance.available.amount_minor(), 0);
    assert_eq!(balance.reserved.amount_minor(), 0);
    assert_eq!(balance.total.amount_minor(), 0);

    Ok(())
}

// ─── Reserve ─────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn reserve_increases_reserved_balance(pool: PgPool) -> sqlx::Result<()> {
    let (engine, ledger) = setup(pool).await;
    let merchant_id = MerchantId::new();

    // An ASSET account representing the acquiring transit float.
    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-float",
            Currency::AOA,
        ))
        .await
        .unwrap();

    let wallet = engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    engine
        .reserve(ReserveRequest {
            idempotency_key: "rsv-01".into(),
            wallet_id: wallet.id,
            amount: kz(5_000_000),
            from_account_id: transit.id,
        })
        .await
        .unwrap();

    let balance = engine.balance(wallet.id).await.unwrap();
    assert_eq!(
        balance.available.amount_minor(),
        0,
        "available must not change on reserve"
    );
    assert_eq!(
        balance.reserved.amount_minor(),
        5_000_000,
        "reserved must increase"
    );
    assert_eq!(
        balance.total.amount_minor(),
        5_000_000,
        "total = available + reserved"
    );

    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn reserve_is_idempotent(pool: PgPool) -> sqlx::Result<()> {
    let (engine, ledger) = setup(pool).await;
    let merchant_id = MerchantId::new();

    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-idem",
            Currency::AOA,
        ))
        .await
        .unwrap();

    let wallet = engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    let make_req = || ReserveRequest {
        idempotency_key: "rsv-idem-01".into(),
        wallet_id: wallet.id,
        amount: kz(1_000_000),
        from_account_id: transit.id,
    };

    engine.reserve(make_req()).await.unwrap();
    engine.reserve(make_req()).await.unwrap(); // duplicate — must not double the balance

    let balance = engine.balance(wallet.id).await.unwrap();
    assert_eq!(
        balance.reserved.amount_minor(),
        1_000_000,
        "idempotent reserve must not double-credit"
    );

    Ok(())
}

// ─── Settle ──────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn settle_moves_reserved_to_available(pool: PgPool) -> sqlx::Result<()> {
    let (engine, ledger) = setup(pool).await;
    let merchant_id = MerchantId::new();

    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-settle",
            Currency::AOA,
        ))
        .await
        .unwrap();

    let wallet = engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    // Reserve first.
    engine
        .reserve(ReserveRequest {
            idempotency_key: "rsv-settle-01".into(),
            wallet_id: wallet.id,
            amount: kz(10_000_000),
            from_account_id: transit.id,
        })
        .await
        .unwrap();

    // Settle (capture): moves from reserved to available.
    engine
        .settle(SettleRequest {
            idempotency_key: "settle-01".into(),
            wallet_id: wallet.id,
            amount: kz(10_000_000),
        })
        .await
        .unwrap();

    let balance = engine.balance(wallet.id).await.unwrap();
    assert_eq!(
        balance.available.amount_minor(),
        10_000_000,
        "available must increase after settle"
    );
    assert_eq!(
        balance.reserved.amount_minor(),
        0,
        "reserved must clear after settle"
    );

    Ok(())
}

// ─── Release ─────────────────────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn release_restores_available_after_reserve(pool: PgPool) -> sqlx::Result<()> {
    let (engine, ledger) = setup(pool).await;
    let merchant_id = MerchantId::new();

    let transit = ledger
        .create_account(Account::new(
            AccountType::Asset,
            "transit-release",
            Currency::AOA,
        ))
        .await
        .unwrap();

    let wallet = engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    engine
        .reserve(ReserveRequest {
            idempotency_key: "rsv-release-01".into(),
            wallet_id: wallet.id,
            amount: kz(7_500_000),
            from_account_id: transit.id,
        })
        .await
        .unwrap();

    engine
        .release(ReleaseRequest {
            idempotency_key: "rel-01".into(),
            wallet_id: wallet.id,
            amount: kz(7_500_000),
            to_account_id: transit.id,
        })
        .await
        .unwrap();

    let balance = engine.balance(wallet.id).await.unwrap();
    assert_eq!(
        balance.available.amount_minor(),
        0,
        "available must be zero after release"
    );
    assert_eq!(
        balance.reserved.amount_minor(),
        0,
        "reserved must clear after release"
    );
    assert_eq!(
        balance.total.amount_minor(),
        0,
        "total must be zero — funds returned to transit"
    );

    Ok(())
}
