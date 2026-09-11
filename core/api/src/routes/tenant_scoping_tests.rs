//! A resource addressed by id is still addressed by its owner.
//!
//! Two internal routes took an id and ignored whose it was: a transaction read
//! (`GET /internal/v1/transactions/:id`) and an API-key revoke
//! (`DELETE /internal/v1/merchants/:id/api-keys/:key_id`, where `:id` was bound
//! and thrown away). The gateway forwards a merchant's own principal, so any
//! Business holding another's id read that Business's transaction or switched
//! off its integration. Both now answer 404 for another Business's resource —
//! the same answer as for one that does not exist, so the id is not confirmed.

use axum::extract::{Path, Query, State};
use axum::Json;
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::{merchants, transactions};
use crate::state::{AppState, CoreEnvironment};

async fn ledger_account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES (gen_random_uuid(),$1,'a','AOA') RETURNING id",
    )
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = ledger_account(&pool, "ASSET").await;
    let bank = ledger_account(&pool, "ASSET").await;
    let fee = ledger_account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(fee),
        CoreEnvironment::Sandbox,
    )
}

async fn merchant(pool: &PgPool) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1,'m',$2,'ACTIVE')")
        .bind(id)
        .bind(format!("{id}@scoping.test"))
        .execute(pool)
        .await
        .unwrap();
    id
}

async fn transaction_of(pool: &PgPool, merchant: Uuid) -> Uuid {
    let avail = ledger_account(pool, "LIABILITY").await;
    let reserved = ledger_account(pool, "LIABILITY").await;
    let wallet = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id)
         VALUES ($1,$2,'AOA','ACTIVE',$3,$4)",
    )
    .bind(wallet)
    .bind(merchant)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO transactions
             (id, idempotency_key, transaction_type, status, amount_minor, currency,
              merchant_id, wallet_id, environment)
         VALUES ($1,$2,'PAYMENT','PENDING',1000,'AOA',$3,$4,'SANDBOX')",
    )
    .bind(id)
    .bind(id.to_string())
    .bind(merchant)
    .bind(wallet)
    .execute(pool)
    .await
    .unwrap();
    id
}

async fn read(state: &AppState, tx: Uuid, as_merchant: Uuid) -> Result<serde_json::Value, u16> {
    transactions::get(
        State(state.clone()),
        Path(tx.to_string()),
        Query(transactions::OwnerQuery {
            merchant_id: as_merchant.to_string(),
        }),
    )
    .await
    .map(|Json(v)| v)
    .map_err(|e| e.status.as_u16())
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_merchant_reads_its_own_transaction_and_not_anothers(pool: PgPool) {
    let owner = merchant(&pool).await;
    let stranger = merchant(&pool).await;
    let tx = transaction_of(&pool, owner).await;
    let state = build_state(pool).await;

    let own = read(&state, tx, owner)
        .await
        .expect("owner reads its transaction");
    assert_eq!(own["id"], tx.to_string());

    assert_eq!(read(&state, tx, stranger).await.unwrap_err(), 404);
    // Indistinguishable from an id nobody holds.
    assert_eq!(
        read(&state, Uuid::new_v4(), stranger).await.unwrap_err(),
        404
    );
}

async fn issue_key(state: &AppState, merchant: Uuid) -> String {
    let (_, Json(k)) = merchants::create_api_key(
        State(state.clone()),
        Path(merchant.to_string()),
        Json(merchants::CreateApiKeyBody {
            name: "integration".into(),
            environment: Some("SANDBOX".into()),
        }),
    )
    .await
    .unwrap();
    k["key"]["id"].as_str().unwrap().to_string()
}

async fn revoke(state: &AppState, merchant: Uuid, key: &str) -> Result<(), u16> {
    merchants::revoke_api_key(
        State(state.clone()),
        Path((merchant.to_string(), key.to_string())),
    )
    .await
    .map(|_| ())
    .map_err(|e| e.status.as_u16())
}

async fn revoked_at(pool: &PgPool, key: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    sqlx::query_scalar("SELECT revoked_at FROM api_keys WHERE id = $1::uuid")
        .bind(key)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_merchant_cannot_revoke_another_merchants_key(pool: PgPool) {
    let owner = merchant(&pool).await;
    let stranger = merchant(&pool).await;
    let state = build_state(pool.clone()).await;
    let key = issue_key(&state, owner).await;

    // The stranger names the key under its own path: refused, and the key lives.
    assert_eq!(revoke(&state, stranger, &key).await.unwrap_err(), 404);
    assert!(
        revoked_at(&pool, &key).await.is_none(),
        "another Business's key was revoked"
    );

    // Its owner can.
    revoke(&state, owner, &key)
        .await
        .expect("owner revokes its key");
    assert!(revoked_at(&pool, &key).await.is_some());
}
