//! Real-DB route tests for the internal Wallet Accounts API (BANZA ADR-042).
//! Exercises create/list/get/resolve through the axum handlers over a real pool.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::wallet_accounts as routes;
use crate::routes::wallet_accounts::{CreateBody, ResolveQuery};
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

/// Seed an ACTIVE merchant wallet (the 0081 trigger auto-creates its PRIMARY).
async fn seed_wallet(pool: &PgPool, merchant: Uuid) -> (Uuid, Uuid) {
    let avail = account(pool, "LIABILITY", "available").await;
    let reserved = account(pool, "LIABILITY", "reserved").await;
    let wid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(wid)
    .bind(merchant)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    (wid, avail)
}

/// Credit a LIABILITY account by a balanced posting (DEBIT bank, CREDIT account).
async fn fund(pool: &PgPool, account_id: Uuid, amount: i64) {
    let bank = account(pool, "ASSET", "fund-bank").await;
    let posting = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, 'fund', $2, NOW())",
    )
    .bind(posting)
    .bind(format!("fund-{account_id}-{amount}"))
    .execute(pool)
    .await
    .unwrap();
    for (acc, ty) in [(bank, "DEBIT"), (account_id, "CREDIT")] {
        sqlx::query(
            "INSERT INTO ledger_entries (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, 'AOA', NOW())",
        )
        .bind(Uuid::new_v4())
        .bind(posting)
        .bind(acc)
        .bind(ty)
        .bind(amount)
        .execute(pool)
        .await
        .unwrap();
    }
}

fn body(wallet: Uuid, purpose: &str, reference: Option<&str>) -> CreateBody {
    CreateBody {
        wallet_id: wallet.to_string(),
        merchant_id: None,
        purpose: purpose.to_string(),
        reference_type: reference.map(|_| "DOA_CAMPAIGN".to_string()),
        reference_id: reference.map(|r| r.to_string()),
        label: Some("Test".to_string()),
        idempotency_key: None,
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn new_wallet_gets_primary(pool: PgPool) {
    let (wid, avail) = seed_wallet(&pool, Uuid::new_v4()).await;
    let (acc, purpose): (Uuid, String) = sqlx::query_as(
        "SELECT account_id, purpose FROM wallet_accounts WHERE wallet_id = $1 AND purpose = 'PRIMARY'",
    )
    .bind(wid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(purpose, "PRIMARY");
    assert_eq!(
        acc, avail,
        "PRIMARY must adopt the wallet's available account"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn create_two_isolated_campaign_accounts(pool: PgPool) {
    let (wid, _) = seed_wallet(&pool, Uuid::new_v4()).await;
    let state = build_state(pool.clone()).await;

    let (sa, Json(a)) = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some("camp_A"))),
    )
    .await
    .unwrap();
    assert_eq!(sa, axum::http::StatusCode::CREATED);
    assert_eq!(a["purpose"], "CAMPAIGN");
    let (_, Json(b)) = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some("camp_B"))),
    )
    .await
    .unwrap();
    assert_ne!(
        a["account_id"], b["account_id"],
        "two campaigns get distinct accounts"
    );

    // Fund campaign A only; B stays zero — isolation.
    fund(
        &pool,
        a["account_id"].as_str().unwrap().parse().unwrap(),
        100_000,
    )
    .await;
    let (_, Json(a2)) = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some("camp_A"))),
    )
    .await
    .unwrap(); // idempotent — returns the same account
    assert_eq!(a2["id"], a["id"], "duplicate reference is idempotent");
    assert_eq!(
        a2["available_balance_minor"], 100_000,
        "balance read from ledger"
    );

    let (_, Json(b2)) = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some("camp_B"))),
    )
    .await
    .unwrap();
    assert_eq!(
        b2["available_balance_minor"], 0,
        "campaign B unaffected by A's funding"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn primary_cannot_be_created_via_api(pool: PgPool) {
    let (wid, _) = seed_wallet(&pool, Uuid::new_v4()).await;
    let state = build_state(pool).await;
    let r = routes::create(State(state), Json(body(wid, "PRIMARY", None))).await;
    assert!(r.is_err(), "PRIMARY must not be creatable via the API");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn cross_merchant_rejected(pool: PgPool) {
    let (wid, _) = seed_wallet(&pool, Uuid::new_v4()).await;
    let state = build_state(pool).await;
    let mut b = body(wid, "CAMPAIGN", Some("camp_X"));
    b.merchant_id = Some(Uuid::new_v4().to_string()); // not the wallet owner
    assert!(routes::create(State(state), Json(b)).await.is_err());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn inactive_wallet_rejected(pool: PgPool) {
    let (wid, _) = seed_wallet(&pool, Uuid::new_v4()).await;
    sqlx::query("UPDATE wallets SET status = 'SUSPENDED' WHERE id = $1")
        .bind(wid)
        .execute(&pool)
        .await
        .unwrap();
    let state = build_state(pool).await;
    assert!(
        routes::create(State(state), Json(body(wid, "CAMPAIGN", Some("camp_Y"))))
            .await
            .is_err()
    );
}

/// ADR-042 (Unit 6): the settlement webhook routing resolves the owning merchant
/// from a segregated account too — not only a wallet's default available account.
/// Without this, a campaign-account settlement would emit no webhook.
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_resolves_from_campaign_account(pool: PgPool) {
    let merchant = Uuid::new_v4();
    let (wid, _) = seed_wallet(&pool, merchant).await;
    let state = build_state(pool.clone()).await;
    let (_, Json(a)) = routes::create(State(state), Json(body(wid, "CAMPAIGN", Some("camp_W"))))
        .await
        .unwrap();
    let camp_acct: Uuid = a["account_id"].as_str().unwrap().parse().unwrap();

    // Mirror the webhook routing query: resolve merchant from either source.
    let resolved: Option<Uuid> = sqlx::query_scalar(
        "SELECT merchant_id FROM wallets WHERE available_account_id = $1
         UNION ALL
         SELECT merchant_id FROM wallet_accounts WHERE account_id = $1
         LIMIT 1",
    )
    .bind(camp_acct)
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert_eq!(
        resolved,
        Some(merchant),
        "campaign account must resolve to its merchant"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn resolve_and_list(pool: PgPool) {
    let (wid, _) = seed_wallet(&pool, Uuid::new_v4()).await;
    let state = build_state(pool.clone()).await;
    // Side-effect call: the account must exist for the resolve/list assertions
    // below. axum's Json is #[must_use], so discard the response explicitly.
    let _ = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some("camp_R"))),
    )
    .await
    .unwrap();

    let Json(resolved) = routes::resolve(
        State(state.clone()),
        Query(ResolveQuery {
            wallet_id: wid.to_string(),
            purpose: "CAMPAIGN".into(),
            reference_type: Some("DOA_CAMPAIGN".into()),
            reference_id: Some("camp_R".into()),
        }),
    )
    .await
    .unwrap();
    assert_eq!(resolved["reference_id"], "camp_R");

    let Json(list) = routes::list_for_wallet(State(state), Path(wid.to_string()))
        .await
        .unwrap();
    // PRIMARY + the campaign account.
    assert_eq!(list["data"].as_array().unwrap().len(), 2);
}
