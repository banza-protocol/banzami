//! ADR-030: the internal transfer route honours `recipient_account_id` (set from a
//! Payment Session's payment link), crediting the segregated campaign account — and
//! falls back to the wallet's default account when absent (legacy links). The engine
//! itself is covered by banzami-transfers/tests/wallet_account_routing.rs; these
//! tests prove the ROUTE parses the field and threads it through.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::transfers::{self as routes, SendTransferBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, $2, 'acct', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let operator_fee = account(&pool, "REVENUE").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(operator_fee),
        CoreEnvironment::Sandbox,
    )
}

async fn balance(pool: &PgPool, acct: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor
                                             WHEN 'DEBIT' THEN -amount_minor END),0)::BIGINT
         FROM ledger_entries WHERE account_id=$1",
    )
    .bind(acct)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Funded consumer (the payer). Returns consumer id.
async fn funded_consumer(pool: &PgPool, amount: i64) -> Uuid {
    let c = Uuid::new_v4();
    sqlx::query("INSERT INTO consumers (id, handle, status) VALUES ($1,$2,'ACTIVE')")
        .bind(c)
        .bind(format!("payer_{}", &c.to_string()[..8]))
        .execute(pool)
        .await
        .unwrap();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (id,consumer_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(Uuid::new_v4()).bind(c).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let bank = account(pool, "ASSET").await;
    let p = Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_postings (id,description,idempotency_key,created_at) VALUES ($1,'fund',$2,NOW())")
        .bind(p).bind(format!("fund-{c}")).execute(pool).await.unwrap();
    for (a, t) in [(bank, "DEBIT"), (avail, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id,posting_id,account_id,entry_type,amount_minor,currency,created_at) VALUES ($1,$2,$3,$4,$5,'AOA',NOW())")
            .bind(Uuid::new_v4()).bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
    }
    c
}

/// Merchant wallet (0081 trigger creates PRIMARY). Returns (wallet_id, available account).
async fn merchant_wallet(pool: &PgPool) -> (Uuid, Uuid) {
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    let wid = Uuid::new_v4();
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(wid).bind(Uuid::new_v4()).bind(avail).bind(reserved).execute(pool).await.unwrap();
    (wid, avail)
}

async fn campaign_account(pool: &PgPool, wallet_id: Uuid) -> (Uuid, Uuid) {
    let merchant: Uuid = sqlx::query_scalar("SELECT merchant_id FROM wallets WHERE id=$1")
        .bind(wallet_id).fetch_one(pool).await.unwrap();
    let acct = account(pool, "LIABILITY").await;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO wallet_accounts (id,wallet_id,account_id,merchant_id,currency,purpose,status,label) VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','ACTIVE','c')")
        .bind(id).bind(wallet_id).bind(acct).bind(merchant).execute(pool).await.unwrap();
    (id, acct)
}

fn body(sender: Uuid, wallet: Uuid, recipient_account_id: Option<Uuid>, key: &str) -> SendTransferBody {
    SendTransferBody {
        idempotency_key: key.to_string(),
        sender_id: sender.to_string(),
        recipient_id: wallet.to_string(),
        amount_minor: 50_000,
        currency: "AOA".into(),
        description: Some("Payment link".into()),
        recipient_account_id: recipient_account_id.map(|u| u.to_string()),
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_credits_campaign_account_when_set(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, avail) = merchant_wallet(&pool).await;
    let (camp_id, camp_acct) = campaign_account(&pool, wid).await;
    let state = build_state(pool.clone()).await;

    routes::send(State(state), Json(body(sender, wid, Some(camp_id), "k1"))).await.unwrap();

    assert_eq!(balance(&pool, camp_acct).await, 50_000, "campaign account credited");
    assert_eq!(balance(&pool, avail).await, 0, "default account untouched (isolation)");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_credits_default_when_absent(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid, avail) = merchant_wallet(&pool).await;
    let (_camp_id, camp_acct) = campaign_account(&pool, wid).await;
    let state = build_state(pool.clone()).await;

    routes::send(State(state), Json(body(sender, wid, None, "k1"))).await.unwrap();

    assert_eq!(balance(&pool, avail).await, 50_000, "legacy link credits default");
    assert_eq!(balance(&pool, camp_acct).await, 0, "campaign untouched");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn route_rejects_foreign_account(pool: PgPool) {
    let sender = funded_consumer(&pool, 200_000).await;
    let (wid_a, _) = merchant_wallet(&pool).await;
    let (wid_b, _) = merchant_wallet(&pool).await;
    let (foreign, _) = campaign_account(&pool, wid_b).await;
    let state = build_state(pool.clone()).await;

    let r = routes::send(State(state), Json(body(sender, wid_a, Some(foreign), "k1"))).await;
    assert!(r.is_err(), "an account from another wallet must be rejected");
}
