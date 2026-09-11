//! A dynamic QR bound to a segregated wallet account (ADR-042) is accepted for
//! the owner's own account and refused for anyone else's.
//!
//! The check compared `wallet_accounts.wallet_id` with the QR's owner id — a
//! merchant id — so no binding could ever match and every QR with a
//! `wallet_account_id` was refused with 422, the owner's own included.

use axum::extract::State;
use axum::Json;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::qr::{self, CreateDynamicQrBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(),$1,'a','AOA') RETURNING id",
    )
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let fee = account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

/// A merchant with a wallet and one ACTIVE campaign account; returns
/// (merchant, wallet account).
async fn merchant_with_account(pool: &PgPool) -> (Uuid, Uuid) {
    let merchant = Uuid::new_v4();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wallet = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(wallet).bind(merchant).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let wa_acct = account(pool, "LIABILITY").await;
    let wa = Uuid::new_v4();
    sqlx::query("INSERT INTO wallet_accounts (id,wallet_id,account_id,merchant_id,currency,purpose,status,label) VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','ACTIVE','c')")
        .bind(wa).bind(wallet).bind(wa_acct).bind(merchant).execute(pool).await.unwrap();
    (merchant, wa)
}

fn body(owner: Uuid, owner_type: &str, account: Uuid) -> CreateDynamicQrBody {
    CreateDynamicQrBody {
        owner_id: owner.to_string(),
        owner_type: owner_type.into(),
        currency: "AOA".into(),
        amount_minor: 5_000,
        expires_at: chrono::Utc::now() + chrono::Duration::minutes(30),
        reference: None,
        wallet_account_id: Some(account.to_string()),
    }
}

async fn create(
    state: &AppState,
    b: CreateDynamicQrBody,
) -> Result<serde_json::Value, (u16, String)> {
    qr::create_dynamic(State(state.clone()), Json(b))
        .await
        .map(|(_, Json(v))| v)
        .map_err(|e| (e.status.as_u16(), e.message))
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_merchant_binds_its_own_account(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (merchant, wa) = merchant_with_account(&pool).await;

    let v = create(&state, body(merchant, "MERCHANT", wa))
        .await
        .expect("own account refused");
    assert_eq!(v["qr_code"]["wallet_account_id"], wa.to_string());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_one_binds_anothers_account(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let (_victim, victims_account) = merchant_with_account(&pool).await;
    let (attacker, _) = merchant_with_account(&pool).await;

    let err = create(&state, body(attacker, "MERCHANT", victims_account))
        .await
        .unwrap_err();
    assert_eq!(err.0, 422, "another merchant's account was bound: {err:?}");

    // A consumer-owned QR has no merchant account to bind.
    let err = create(&state, body(Uuid::new_v4(), "CONSUMER", victims_account))
        .await
        .unwrap_err();
    assert_eq!(
        err.0, 422,
        "a consumer QR bound a merchant account: {err:?}"
    );
}
