// Capture credits the payee the GROSS, and asks nobody what it costs.
//
// THIS FILE REPLACES operator_fee_integration.rs
//
// That suite proved capture's operator-fee behaviour in detail: a 2% donation
// fee posted as a paired leg, an explicit 0-bps rule capturing at zero with an
// attributable rule id, a missing rule refusing, a rule change never repricing
// a settled fee. Every one of those assertions was correct, and every one is
// now meaningless, because capture has left operator pricing entirely.
//
// Under the confirmed economic model a payment or donation credits the merchant
// wallet GROSS. The operator's rate is resolved one step later, at a genuinely
// fee-bearing operation — settlement or payout — and the assurance that used to
// live here lives there now.
//
// Deleting a passing suite is worth being deliberate about, so what replaces it
// asserts the thing that took its place: capture moves the whole amount, writes
// no operator_fees row, and produces a single balanced two-leg posting.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-transactions --test capture_is_gross_integration

use std::sync::Arc;

use sqlx::PgPool;
use uuid::Uuid;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_transactions::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, PostgresTransactionEngine,
    PostgresTransactionRepository, TransactionEngine, TransactionStatus, TransactionType,
};
use banzami_types::{AccountId, Currency, MerchantId, Money};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, WalletEngine,
};

const ENV: &str = "LIVE";

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

type Wallets = PostgresWalletEngine<PostgresLedgerRepository, PostgresWalletRepository>;

struct Fixture {
    engine: PostgresTransactionEngine<Wallets, PostgresTransactionRepository>,
    wallet_engine: Wallets,
    pool: PgPool,
}

async fn ensure_account(pool: &PgPool, ty: AccountType, name: &str) -> AccountId {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    ledger
        .create_account(Account::new(ty, name, Currency::AOA))
        .await
        .unwrap()
        .id
}

async fn setup(pool: PgPool) -> Fixture {
    let transit = ensure_account(&pool, AccountType::Asset, "System — Transit").await;
    let wallet_engine = PostgresWalletEngine::new(
        Arc::new(PostgresLedgerRepository::new(pool.clone())),
        PostgresWalletRepository::new(pool.clone()),
    );
    let tx_wallet_engine = PostgresWalletEngine::new(
        Arc::new(PostgresLedgerRepository::new(pool.clone())),
        PostgresWalletRepository::new(pool.clone()),
    );
    // Three arguments, not six. The Pricing Engine provider, the operator fee
    // account and even the environment are gone: the environment existed only
    // to scope pricing-rule loading, and this crate no longer depends on
    // banzami-pricing at all.
    let engine = PostgresTransactionEngine::new(
        Arc::new(tx_wallet_engine),
        PostgresTransactionRepository::new(pool.clone()),
        transit,
    );
    Fixture {
        engine,
        wallet_engine,
        pool,
    }
}

/// Seeds a rule that would have priced this capture under the old model, at a
/// rate impossible to mistake for a rounding artefact.
///
/// Its presence is the point: even with a matching, enabled, generous rule
/// sitting in the table, capture must charge nothing — because it does not look.
async fn seed_a_rule_that_must_not_apply(pool: &PgPool) {
    sqlx::query(
        "INSERT INTO pricing_rules (id, rule_key, business_category, rate_bps, environment)
         VALUES ($1, 'would-have-charged-5pc', 'DONATION', 500, $2)",
    )
    .bind(Uuid::new_v4())
    .bind(ENV)
    .execute(pool)
    .await
    .unwrap();
}

async fn captured_tx(
    fx: &Fixture,
    idem: &str,
    amount: i64,
    category: Option<&str>,
) -> (Uuid, Uuid) {
    let merchant_id = MerchantId::new();
    let wallet = fx
        .wallet_engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();

    let tx = fx
        .engine
        .create(CreateTransactionRequest {
            idempotency_key: idem.into(),
            transaction_type: TransactionType::Payment,
            amount: kz(amount),
            merchant_id,
            wallet_id: wallet.id,
            description: None,
            business_category: category.map(str::to_string),
            pricing_profile: None,
            fee_policy_ref: None,
        })
        .await
        .unwrap();
    fx.engine
        .authorize(AuthorizeRequest { tx_id: tx.id })
        .await
        .unwrap();
    let captured = fx
        .engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();
    assert_eq!(captured.status, TransactionStatus::Captured);
    (tx.id.as_uuid(), wallet.id.as_uuid())
}

async fn wallet_balance(pool: &PgPool, wallet_id: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                                  ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries
          WHERE account_id = (SELECT available_account_id FROM wallets WHERE id = $1)",
    )
    .bind(wallet_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn capture_credits_gross_even_with_a_matching_rule_present(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_a_rule_that_must_not_apply(&fx.pool).await;

    let (_tx, wallet) = captured_tx(&fx, "idem-gross", 100_000, Some("DONATION")).await;

    assert_eq!(
        wallet_balance(&fx.pool, wallet).await,
        100_000,
        "the payee receives the gross — a matching 5% rule exists and must not be consulted"
    );
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn capture_records_no_operator_fee(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_a_rule_that_must_not_apply(&fx.pool).await;

    let (tx, _wallet) = captured_tx(&fx, "idem-nofee", 100_000, Some("DONATION")).await;

    let rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM operator_fees WHERE transaction_id = $1")
            .bind(tx)
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(
        rows, 0,
        "capture writes no operator_fees row — not a row with a fee of zero"
    );

    let fee: i64 = sqlx::query_scalar("SELECT fee_minor FROM transactions WHERE id = $1")
        .bind(tx)
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(fee, 0, "the transaction's fee column stays at its default");
    Ok(())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn capture_posts_two_legs_and_stays_balanced(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    let (_tx, wallet) = captured_tx(&fx, "idem-legs", 50_000, None).await;

    let posting: Uuid = sqlx::query_scalar(
        "SELECT e.posting_id FROM ledger_entries e
          WHERE e.account_id = (SELECT available_account_id FROM wallets WHERE id = $1)
          ORDER BY e.created_at DESC LIMIT 1",
    )
    .bind(wallet)
    .fetch_one(&fx.pool)
    .await
    .unwrap();

    let legs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ledger_entries WHERE posting_id = $1")
        .bind(posting)
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(
        legs, 2,
        "gross to the payee is a two-leg posting; a fee would have added a paired posting"
    );

    let net: i64 = sqlx::query_scalar(
        "SELECT SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                         ELSE -amount_minor END)::BIGINT
           FROM ledger_entries WHERE posting_id = $1",
    )
    .bind(posting)
    .fetch_one(&fx.pool)
    .await
    .unwrap();
    assert_eq!(net, 0, "the posting balances");
    Ok(())
}
