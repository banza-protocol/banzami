// Real-DB invariant tests for the Operator Fee on transaction capture
// (Banzami ADR-021 / BANZA ADR-039 — increment 3).
//
// Verifies, against a real PostgreSQL, that capture applies the operator fee as
// ONE balanced ledger leg: payee credited NET, operator-fee REVENUE account
// credited the fee, source debited the GROSS — never creating/destroying money,
// never a negative net, idempotent on replay, with an immutable pricing snapshot.
//
// Run: DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
//      cargo test -p banzami-transactions --test operator_fee_integration

// `5_000_00` etc. is intentional minor-unit money grouping (5000.00 Kz).
#![allow(clippy::inconsistent_digit_grouping)]

use std::sync::Arc;

use sqlx::PgPool;
use uuid::Uuid;

use banzami_ledger::{Account, AccountType, LedgerEngine, PostgresLedgerRepository};
use banzami_pricing::PostgresPricingRuleProvider;
use banzami_transactions::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, OperatorFeeFilter,
    PostgresOperatorFeeReadRepository, PostgresTransactionEngine, PostgresTransactionRepository,
    TransactionEngine, TransactionError, TransactionStatus, TransactionType,
};
use banzami_types::{AccountId, Currency, MerchantId, Money};
use banzami_wallets::{
    CreateWalletRequest, PostgresWalletEngine, PostgresWalletRepository, WalletEngine,
};

const ENV: &str = "LIVE";

fn kz(minor: i64) -> Money {
    Money::new(minor, Currency::AOA)
}

struct Fixture {
    engine: PostgresTransactionEngine<
        PostgresWalletEngine<PostgresLedgerRepository, PostgresWalletRepository>,
        PostgresTransactionRepository,
        PostgresPricingRuleProvider,
    >,
    wallet_engine: PostgresWalletEngine<PostgresLedgerRepository, PostgresWalletRepository>,
    pool: PgPool,
    operator_fee_account_id: AccountId,
}

async fn ensure_account(pool: &PgPool, ty: AccountType, name: &str) -> AccountId {
    let ledger = PostgresLedgerRepository::new(pool.clone());
    let id = AccountId::new();
    ledger
        .create_account(Account {
            id,
            account_type: ty,
            name: name.into(),
            currency: Currency::AOA,
            created_at: chrono::Utc::now(),
        })
        .await
        .unwrap();
    id
}

async fn setup(pool: PgPool) -> Fixture {
    let transit = ensure_account(&pool, AccountType::Asset, "System — Transit").await;
    let operator_fee_account_id =
        ensure_account(&pool, AccountType::Revenue, "Operator — Fee Revenue").await;

    let wallet_engine = PostgresWalletEngine::new(
        Arc::new(PostgresLedgerRepository::new(pool.clone())),
        PostgresWalletRepository::new(pool.clone()),
    );
    let tx_wallet_engine = PostgresWalletEngine::new(
        Arc::new(PostgresLedgerRepository::new(pool.clone())),
        PostgresWalletRepository::new(pool.clone()),
    );
    let engine = PostgresTransactionEngine::new(
        Arc::new(tx_wallet_engine),
        PostgresTransactionRepository::new(pool.clone()),
        transit,
        Arc::new(PostgresPricingRuleProvider::new(pool.clone())),
        operator_fee_account_id,
        ENV,
    );
    Fixture {
        engine,
        wallet_engine,
        pool,
        operator_fee_account_id,
    }
}

async fn seed_rule(pool: &PgPool, key: &str, category: &str, rate_bps: i32) {
    sqlx::query(
        "INSERT INTO pricing_rules (id, rule_key, business_category, rate_bps, environment)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(key)
    .bind(category)
    .bind(rate_bps)
    .bind(ENV)
    .execute(pool)
    .await
    .unwrap();
}

/// Signed minor-unit balance of a ledger account (credits +, debits −).
async fn account_balance(pool: &PgPool, account_id: AccountId) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                                  ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id.as_uuid())
    .fetch_one(pool)
    .await
    .unwrap()
}

/// The whole posting nets to zero in minor units (double-entry balance, ADR-002).
async fn posting_is_balanced(pool: &PgPool, posting_id: Uuid) -> bool {
    let net: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor
                         ELSE -amount_minor END)::BIGINT
           FROM ledger_entries WHERE posting_id = $1",
    )
    .bind(posting_id)
    .fetch_one(pool)
    .await
    .unwrap();
    net == Some(0)
}

async fn new_wallet(fx: &Fixture) -> (MerchantId, banzami_types::WalletId) {
    let merchant_id = MerchantId::new();
    let wallet = fx
        .wallet_engine
        .create(CreateWalletRequest {
            merchant_id,
            currency: Currency::AOA,
        })
        .await
        .unwrap();
    (merchant_id, wallet.id)
}

/// Authorize + return the captured transaction, after seeding the given category.
async fn authorize_tx(
    fx: &Fixture,
    idem: &str,
    amount: i64,
    category: Option<&str>,
) -> banzami_transactions::Transaction {
    let (merchant_id, wallet_id) = new_wallet(fx).await;
    let tx = fx
        .engine
        .create(CreateTransactionRequest {
            idempotency_key: idem.into(),
            transaction_type: TransactionType::Payment,
            amount: kz(amount),
            merchant_id,
            wallet_id,
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
        .unwrap()
}

// ─── 5000 AOA @ 2% → gross 5000, fee 100, net 4900 ──────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn donation_two_percent_net_fee_balanced(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await; // 2%

    let tx = authorize_tx(&fx, "idem-2pct", 5_000_00, Some("DONATION")).await;
    let captured = fx
        .engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    assert_eq!(captured.status, TransactionStatus::Captured);
    assert_eq!(
        captured.fee.amount_minor(),
        100_00,
        "fee = 2% of 5000 = 100"
    );

    // Wallet view: payee has NET available, nothing reserved.
    let bal = fx.wallet_engine.balance(captured.wallet_id).await.unwrap();
    assert_eq!(bal.available.amount_minor(), 4_900_00, "payee NET");
    assert_eq!(bal.reserved.amount_minor(), 0);

    // Operator fee account credited the fee.
    assert_eq!(
        account_balance(&fx.pool, fx.operator_fee_account_id).await,
        100_00
    );

    // operator_fees row: resolved fee + snapshot pinned to rule version 1.
    let (amount, rule_ver, status, snap): (i64, Option<i32>, String, serde_json::Value) =
        sqlx::query_as(
            "SELECT amount_minor, pricing_rule_version, status, snapshot_json
                          FROM operator_fees WHERE transaction_id = $1",
        )
        .bind(tx.id.as_uuid())
        .fetch_one(&fx.pool)
        .await
        .unwrap();
    assert_eq!(amount, 100_00);
    assert_eq!(rule_ver, Some(1));
    assert_eq!(status, "APPLIED");
    assert_eq!(snap["fee_minor"], serde_json::json!(100_00));
    assert_eq!(snap["rate_bps"], serde_json::json!(200));

    // The fee leg is part of ONE balanced posting.
    let posting_id: Uuid =
        sqlx::query_scalar("SELECT posting_id FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert!(
        posting_is_balanced(&fx.pool, posting_id).await,
        "posting balanced"
    );

    Ok(())
}

// ─── zero-fee category → gross == net ───────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn government_zero_bps_gross_equals_net(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "gov-free", "GOVERNMENT", 0).await; // explicit 0%

    let tx = authorize_tx(&fx, "idem-gov", 3_000_00, Some("GOVERNMENT")).await;
    let captured = fx
        .engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    assert_eq!(captured.fee.amount_minor(), 0);
    let bal = fx.wallet_engine.balance(captured.wallet_id).await.unwrap();
    assert_eq!(bal.available.amount_minor(), 3_000_00, "gross == net");
    assert_eq!(
        account_balance(&fx.pool, fx.operator_fee_account_id).await,
        0
    );

    // A zero-fee row is still recorded (auditable), rule matched.
    let (amount, rule_ver): (i64, Option<i32>) = sqlx::query_as(
        "SELECT amount_minor, pricing_rule_version FROM operator_fees WHERE transaction_id = $1",
    )
    .bind(tx.id.as_uuid())
    .fetch_one(&fx.pool)
    .await
    .unwrap();
    assert_eq!(amount, 0);
    assert_eq!(rule_ver, Some(1));
    Ok(())
}

// ─── unknown/unpriced category → no fee, no rule ────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn unknown_category_no_fee(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await;

    // category that no rule matches
    let tx = authorize_tx(&fx, "idem-unknown", 8_000_00, Some("SPACE_TOURISM")).await;
    let captured = fx
        .engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    assert_eq!(captured.fee.amount_minor(), 0, "unpriced -> no fee");
    let bal = fx.wallet_engine.balance(captured.wallet_id).await.unwrap();
    assert_eq!(bal.available.amount_minor(), 8_000_00);
    assert_eq!(
        account_balance(&fx.pool, fx.operator_fee_account_id).await,
        0
    );

    let rule_id: Option<Uuid> =
        sqlx::query_scalar("SELECT pricing_rule_id FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert!(rule_id.is_none(), "no rule matched -> NULL rule id");
    Ok(())
}

// ─── no category at all → unchanged behaviour (zero fee) ─────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_category_is_unchanged_zero_fee(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await;

    let tx = authorize_tx(&fx, "idem-nocat", 1_000_00, None).await;
    let captured = fx
        .engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    assert_eq!(captured.fee.amount_minor(), 0);
    let bal = fx.wallet_engine.balance(captured.wallet_id).await.unwrap();
    assert_eq!(bal.available.amount_minor(), 1_000_00);
    Ok(())
}

// ─── fee > amount is rejected (never a negative net) ────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_exceeding_amount_is_rejected(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "absurd", "DONATION", 20_000).await; // 200% -> fee > amount

    let tx = authorize_tx(&fx, "idem-absurd", 5_000_00, Some("DONATION")).await;
    let result = fx.engine.capture(CaptureRequest { tx_id: tx.id }).await;

    assert!(
        matches!(result, Err(TransactionError::FeeExceedsAmount { .. })),
        "fee exceeding amount must be rejected, got {result:?}"
    );
    // No partial state: still AUTHORIZED, nothing settled, no fee row, no fee credit.
    let after = fx.engine.get(tx.id).await.unwrap();
    assert_eq!(after.status, TransactionStatus::Authorized);
    assert_eq!(
        account_balance(&fx.pool, fx.operator_fee_account_id).await,
        0
    );
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(count, 0);
    Ok(())
}

// ─── replay does not duplicate the fee or the posting ───────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn capture_replay_is_idempotent(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await;

    let tx = authorize_tx(&fx, "idem-replay", 5_000_00, Some("DONATION")).await;
    fx.engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    // Simulate a retry whose status update was lost: force back to AUTHORIZED and
    // re-capture. The settle key + operator_fees UNIQUE must make this a no-op.
    sqlx::query("UPDATE transactions SET status = 'AUTHORIZED' WHERE id = $1")
        .bind(tx.id.as_uuid())
        .execute(&fx.pool)
        .await
        .unwrap();
    fx.engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    // Fee credited exactly once; payee NET unchanged; one fee row; one posting.
    assert_eq!(
        account_balance(&fx.pool, fx.operator_fee_account_id).await,
        100_00
    );
    let bal = fx.wallet_engine.balance(tx.wallet_id).await.unwrap();
    assert_eq!(bal.available.amount_minor(), 4_900_00);

    let fee_rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(fee_rows, 1, "exactly one operator fee");

    let postings: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key = $1")
            .bind(format!("{}:capture", tx.idempotency_key))
            .fetch_one(&fx.pool)
            .await
            .unwrap();
    assert_eq!(postings, 1, "exactly one capture posting");
    Ok(())
}

// ─── a later rule change never alters an already-recorded fee ───────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn rule_change_does_not_change_old_fee(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await; // v1: 2%

    let tx = authorize_tx(&fx, "idem-immut", 5_000_00, Some("DONATION")).await;
    fx.engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    let snap_before: serde_json::Value =
        sqlx::query_scalar("SELECT snapshot_json FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();

    // Operator raises the rate later (new version row). Disable v1, add v2 @ 5%.
    sqlx::query("UPDATE pricing_rules SET enabled = FALSE WHERE rule_key = 'donation-standard'")
        .execute(&fx.pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO pricing_rules (id, rule_key, version, business_category, rate_bps, environment)
         VALUES ($1, 'donation-standard', 2, 'DONATION', 500, $2)",
    )
    .bind(Uuid::new_v4())
    .bind(ENV)
    .execute(&fx.pool)
    .await
    .unwrap();

    let snap_after: serde_json::Value =
        sqlx::query_scalar("SELECT snapshot_json FROM operator_fees WHERE transaction_id = $1")
            .bind(tx.id.as_uuid())
            .fetch_one(&fx.pool)
            .await
            .unwrap();

    assert_eq!(
        snap_before, snap_after,
        "recorded fee snapshot is immutable"
    );
    assert_eq!(
        snap_after["rate_bps"],
        serde_json::json!(200),
        "still v1's 2%"
    );
    assert_eq!(snap_after["fee_minor"], serde_json::json!(100_00));
    Ok(())
}

// ─── operator-fees read repository (audit surface) ──────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn operator_fee_read_lists_filters_and_gets(pool: PgPool) -> sqlx::Result<()> {
    let fx = setup(pool).await;
    seed_rule(&fx.pool, "donation-standard", "DONATION", 200).await;
    let tx = authorize_tx(&fx, "idem-read", 5_000_00, Some("DONATION")).await;
    fx.engine
        .capture(CaptureRequest { tx_id: tx.id })
        .await
        .unwrap();

    let read = PostgresOperatorFeeReadRepository::new(fx.pool.clone());

    let all = read
        .list(&OperatorFeeFilter {
            limit: 100,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(all.len(), 1);
    let v = &all[0];
    assert_eq!(v.gross_minor, 5_000_00);
    assert_eq!(v.fee_minor, 100_00);
    assert_eq!(v.net_minor, 4_900_00, "net = gross - fee");
    assert_eq!(v.business_category.as_deref(), Some("DONATION"));
    assert_eq!(v.snapshot_json["rate_bps"], serde_json::json!(200));

    // filter hit + miss
    let hit = read
        .list(&OperatorFeeFilter {
            business_category: Some("DONATION".into()),
            limit: 100,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(hit.len(), 1);
    let miss = read
        .list(&OperatorFeeFilter {
            business_category: Some("MARKETPLACE".into()),
            limit: 100,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(miss.len(), 0);

    // get by id
    let got = read.get(v.id).await.unwrap();
    assert_eq!(got.fee_minor, 100_00);
    assert_eq!(got.transaction_id, tx.id.as_uuid());
    Ok(())
}
