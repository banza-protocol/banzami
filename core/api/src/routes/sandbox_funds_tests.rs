//! Retiring synthetic Sandbox value: the exact reverse posting, once per key,
//! audited — and never outside the Sandbox.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::sandbox_funds::{self, RetireBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1, $2, 'a', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn state(pool: PgPool, env: CoreEnvironment) -> (AppState, Uuid) {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let fee = account(&pool, "REVENUE").await;
    crate::state::configure_live_secrets_for_tests();
    (
        AppState::new(
            pool,
            AccountId::from_uuid(transit),
            AccountId::from_uuid(bank),
            AccountId::from_uuid(fee),
            env,
        ),
        transit,
    )
}

async fn balance(pool: &PgPool, acct: Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END),0)::BIGINT FROM ledger_entries WHERE account_id=$1",
    )
    .bind(acct)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// A merchant wallet funded the way the Sandbox funds one: DR transit / CR available.
async fn funded_merchant(pool: &PgPool, transit: Uuid, amount: i64) -> (Uuid, Uuid) {
    let m = Uuid::new_v4();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO wallets (id,merchant_id,currency,status,available_account_id,reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)")
        .bind(Uuid::new_v4()).bind(m).bind(avail).bind(reserved).execute(pool).await.unwrap();
    let p = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id,description,idempotency_key) VALUES ($1,'fund',$2)",
    )
    .bind(p)
    .bind(format!("fund-{m}"))
    .execute(pool)
    .await
    .unwrap();
    for (a, t) in [(transit, "DEBIT"), (avail, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id,posting_id,account_id,entry_type,amount_minor,currency) VALUES ($1,$2,$3,$4,$5,'AOA')")
            .bind(Uuid::new_v4()).bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
    }
    (m, avail)
}

fn body(owner: Uuid, key: &str) -> RetireBody {
    RetireBody {
        owner_type: "MERCHANT".into(),
        owner_id: owner.to_string(),
        reason: "synthetic fixture".into(),
        retired_by: "test-operator".into(),
        idempotency_key: key.into(),
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn retiring_reverses_the_issuance_once(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let (m, avail) = funded_merchant(&pool, transit, 70_000).await;
    assert_eq!(balance(&pool, transit).await, -70_000);

    let Json(r) = sandbox_funds::retire(State(st.clone()), Json(body(m, "r-1")))
        .await
        .unwrap();
    assert_eq!(r["retired_minor"], 70_000);
    assert_eq!(balance(&pool, avail).await, 0);
    assert_eq!(
        balance(&pool, transit).await,
        0,
        "the value went back where it was issued from"
    );

    // The same key again: the same answer, nothing posted.
    let Json(again) = sandbox_funds::retire(State(st.clone()), Json(body(m, "r-1")))
        .await
        .unwrap();
    assert_eq!(again["retired_minor"], 70_000);
    assert_eq!(again["replayed"], true);
    let postings: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM ledger_postings WHERE idempotency_key = 'sandbox-retire:r-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(postings, 1);
    let audits: i64 =
        sqlx::query_scalar("SELECT count(*) FROM audit_log WHERE action = 'SANDBOX_FUNDS_RETIRED'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(audits, 1);

    // Nothing left: a new key retires nothing.
    let Json(zero) = sandbox_funds::retire(State(st), Json(body(m, "r-2")))
        .await
        .unwrap();
    assert_eq!(zero["retired_minor"], 0);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn retiring_is_refused_in_live(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Live).await;
    let (m, avail) = funded_merchant(&pool, transit, 5_000).await;
    let err = sandbox_funds::retire(State(st), Json(body(m, "r-live")))
        .await
        .err()
        .map(|e| e.status);
    assert_eq!(err, Some(axum::http::StatusCode::FORBIDDEN));
    assert_eq!(balance(&pool, avail).await, 5_000);
}
