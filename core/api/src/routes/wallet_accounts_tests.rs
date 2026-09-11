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

    let Json(list) = routes::list_for_wallet(
        State(state),
        Path(wid.to_string()),
        Query(routes::ListQuery {
            include_closed: None,
        }),
    )
    .await
    .unwrap();
    // PRIMARY + the campaign account.
    assert_eq!(list["data"].as_array().unwrap().len(), 2);
}

// ── close ────────────────────────────────────────────────────────────────────

async fn campaign(state: &AppState, wid: Uuid, reference: &str) -> (Uuid, Uuid) {
    let (_, Json(created)) = routes::create(
        State(state.clone()),
        Json(body(wid, "CAMPAIGN", Some(reference))),
    )
    .await
    .unwrap();
    (
        Uuid::parse_str(created["id"].as_str().unwrap()).unwrap(),
        Uuid::parse_str(created["account_id"].as_str().unwrap()).unwrap(),
    )
}

fn close_body(reason: &str, merchant: Option<Uuid>) -> routes::CloseBody {
    routes::CloseBody {
        reason: reason.into(),
        closed_by: "test-operator".into(),
        merchant_id: merchant.map(|m| m.to_string()),
    }
}

async fn list_ids(state: &AppState, wid: Uuid, include_closed: bool) -> Vec<String> {
    let Json(list) = routes::list_for_wallet(
        State(state.clone()),
        Path(wid.to_string()),
        Query(routes::ListQuery {
            include_closed: Some(include_closed),
        }),
    )
    .await
    .unwrap();
    list["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["id"].as_str().unwrap().to_string())
        .collect()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_empty_account_closes_once_audited_and_leaves_the_lists(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let merchant = Uuid::new_v4();
    let (wid, _) = seed_wallet(&pool, merchant).await;
    let (id, _) = campaign(&state, wid, "close-1").await;

    let Json(closed) = routes::close(
        State(state.clone()),
        Path(id.to_string()),
        Json(close_body("synthetic fixture", Some(merchant))),
    )
    .await
    .unwrap();
    assert_eq!(closed["status"], "CLOSED");
    assert!(
        !list_ids(&state, wid, false).await.contains(&id.to_string()),
        "a closed account is not in the list"
    );
    assert!(
        list_ids(&state, wid, true).await.contains(&id.to_string()),
        "but it is not gone"
    );
    let audits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'WALLET_ACCOUNT_CLOSED' AND subject = $1",
    )
    .bind(format!("wallet_account:{id}"))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audits, 1);

    // Idempotent: a second close changes nothing and audits nothing.
    let Json(again) = routes::close(
        State(state.clone()),
        Path(id.to_string()),
        Json(close_body("again", None)),
    )
    .await
    .unwrap();
    assert_eq!(again["status"], "CLOSED");
    let audits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'WALLET_ACCOUNT_CLOSED' AND subject = $1",
    )
    .bind(format!("wallet_account:{id}"))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audits, 1);

    // It can no longer be named as a payee.
    let Json(v) = routes::validate_payee(
        State(state.clone()),
        Json(routes::ValidatePayeeBody {
            merchant_id: merchant.to_string(),
            wallet_id: wid.to_string(),
            wallet_account_id: id.to_string(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(v["valid"], false);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn close_is_refused_for_primary_money_links_and_other_owners(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let merchant = Uuid::new_v4();
    let (wid, _) = seed_wallet(&pool, merchant).await;
    let code = |r: crate::error::ApiResult<Json<serde_json::Value>>| r.err().map(|e| e.code);

    let primary: Uuid = sqlx::query_scalar(
        "SELECT id FROM wallet_accounts WHERE wallet_id = $1 AND purpose = 'PRIMARY'",
    )
    .bind(wid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        code(
            routes::close(
                State(state.clone()),
                Path(primary.to_string()),
                Json(close_body("x", None))
            )
            .await
        ),
        Some("PRIMARY_ACCOUNT")
    );

    let (funded, funded_acct) = campaign(&state, wid, "close-funded").await;
    fund(&pool, funded_acct, 1_000).await;
    assert_eq!(
        code(
            routes::close(
                State(state.clone()),
                Path(funded.to_string()),
                Json(close_body("x", None))
            )
            .await
        ),
        Some("BALANCE_NOT_ZERO")
    );

    let (linked, _) = campaign(&state, wid, "close-linked").await;
    sqlx::query(
        "INSERT INTO payment_links (id, slug, merchant_id, wallet_id, amount_minor, currency, status, environment, wallet_account_id)
         VALUES ($1, 'closelinked01', $2, $3, 100, 'AOA', 'ACTIVE', 'SANDBOX', $4)",
    )
    .bind(Uuid::new_v4())
    .bind(merchant)
    .bind(wid)
    .bind(linked)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        code(
            routes::close(
                State(state.clone()),
                Path(linked.to_string()),
                Json(close_body("x", None))
            )
            .await
        ),
        Some("OPEN_PAYMENT_LINKS")
    );

    let (other, _) = campaign(&state, wid, "close-other").await;
    assert_eq!(
        code(
            routes::close(
                State(state.clone()),
                Path(other.to_string()),
                Json(close_body("x", Some(Uuid::new_v4())))
            )
            .await
        ),
        Some("NOT_FOUND")
    );
    assert_eq!(
        code(
            routes::close(
                State(state.clone()),
                Path(other.to_string()),
                Json(close_body("  ", None))
            )
            .await
        ),
        Some("BAD_REQUEST")
    );

    // None of the refused accounts moved.
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM wallet_accounts WHERE wallet_id = $1 AND status = 'ACTIVE'",
    )
    .bind(wid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(active, 4);
}
