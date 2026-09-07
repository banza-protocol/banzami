//! Every ledger posting must balance — including the sandbox-only ones.
//!
//! `sandbox_credit` wrote a lone CREDIT leg, outside a transaction. Every
//! posting it produced was single-legged, which is money created from nothing:
//! the reconciliation balance checker logged LEDGER INVARIANT VIOLATION for each
//! one, and 91 of 91 postings in the Sandbox database were unbalanced.
//!
//! Being sandbox-only kept it away from real money. It did not keep it away from
//! the invariant the entire ledger rests on, and the inflated funds-in-circulation
//! exhausted the aggregate pilot cap, which is what made the Sandbox stop being
//! able to fund test consumers at all.

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::wallets as routes;
use crate::routes::wallets::SandboxCreditBody;
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str, name: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, $3, 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = account(&pool, "ASSET", "Transit").await;
    let bank = account(&pool, "ASSET", "Bank").await;
    let operator_fee = account(&pool, "REVENUE", "Operator Fee").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(operator_fee),
        CoreEnvironment::Sandbox,
    )
}

async fn seed_wallet(pool: &PgPool) -> Uuid {
    let merchant = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status) VALUES ($1,'M','m@t.test','ACTIVE')",
    )
    .bind(merchant)
    .execute(pool)
    .await
    .unwrap();
    let avail = account(pool, "LIABILITY", "Merchant available").await;
    let reserved = account(pool, "LIABILITY", "Merchant reserved").await;
    let wallet = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1,$2,'AOA','ACTIVE',$3,$4)",
    )
    .bind(wallet)
    .bind(merchant)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    wallet
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn sandbox_credit_posts_a_balanced_entry(pool: PgPool) {
    let wallet = seed_wallet(&pool).await;
    let state = build_state(pool.clone()).await;

    let _ = routes::sandbox_credit(
        State(state),
        Path(wallet.to_string()),
        Json(SandboxCreditBody {
            amount_minor: 50_000,
            currency: Some("AOA".to_string()),
        }),
    )
    .await
    .expect("sandbox credit should succeed");

    // The invariant, stated the way the reconciliation checker states it: for
    // every posting, DEBIT and CREDIT legs cancel.
    let unbalanced: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (
             SELECT p.id
               FROM ledger_postings p
               JOIN ledger_entries e ON e.posting_id = p.id
              GROUP BY p.id
             HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor
                                          WHEN 'CREDIT' THEN e.amount_minor END) <> 0
         ) x",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        unbalanced, 0,
        "sandbox credit produced an unbalanced posting"
    );

    // And specifically: two legs, one of each, same amount.
    let (legs, debits, credits): (i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COUNT(*) FILTER (WHERE entry_type = 'DEBIT'),
                COUNT(*) FILTER (WHERE entry_type = 'CREDIT')
           FROM ledger_entries",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(legs, 2, "expected exactly two legs");
    assert_eq!(debits, 1, "the transit DEBIT leg is missing");
    assert_eq!(credits, 1, "the merchant CREDIT leg is missing");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn sandbox_credit_leaves_no_posting_without_entries(pool: PgPool) {
    let wallet = seed_wallet(&pool).await;
    let state = build_state(pool.clone()).await;
    let _ = routes::sandbox_credit(
        State(state),
        Path(wallet.to_string()),
        Json(SandboxCreditBody {
            amount_minor: 1_000,
            currency: None,
        }),
    )
    .await
    .unwrap();

    // The posting and its legs are written in one transaction. Without that, a
    // failure between the two statements leaves a posting with no entries at
    // all — invisible to a per-posting balance check, because it has nothing to
    // sum.
    let orphans: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ledger_postings p
          WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.posting_id = p.id)",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(orphans, 0, "a posting was written with no entries");
}

// ── the merchant twin ────────────────────────────────────────────────────────
//
// `sandbox_credit` funds a CONSUMER wallet; `admin_credit` funds a MERCHANT one.
// They had the same defect and only the consumer one was fixed, so the merchant
// path kept writing lone CREDIT legs for months afterwards. The economic smoke
// found 51 of them on a Sandbox that was three hours old.
//
// Both are tested here, together, so the next person to fix one has the other in
// front of them.

#[sqlx::test(migrations = "../../db/migrations")]
async fn admin_credit_posts_a_balanced_entry(pool: PgPool) {
    let wallet = seed_wallet(&pool).await;
    let state = build_state(pool.clone()).await;

    let before: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let _ = routes::admin_credit(
        State(state),
        Path(wallet.to_string()),
        Json(crate::routes::wallets::AdminCreditBody {
            amount_minor: 50_000,
            currency: Some("AOA".to_string()),
            reason: "balanced-entry test".to_string(),
        }),
    )
    .await
    .expect("admin credit should succeed");

    let unbalanced: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (
             SELECT p.id
               FROM ledger_postings p
               JOIN ledger_entries e ON e.posting_id = p.id
              GROUP BY p.id
             HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor
                                          ELSE e.amount_minor END) <> 0) x",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(unbalanced, 0, "admin credit wrote an unbalanced posting");

    let single_leg: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (SELECT posting_id FROM ledger_entries
                                GROUP BY posting_id HAVING COUNT(*) < 2) x",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(single_leg, 0, "admin credit wrote a single-legged posting");

    // The book still sums to what it summed to. Funding a wallet moves value
    // between accounts; it does not create any.
    let after: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(after, before, "the book gained value out of nothing");
}
