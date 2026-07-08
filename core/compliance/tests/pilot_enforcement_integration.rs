// Real-database integration tests for V1.0 pilot-limit RUNTIME enforcement
// (CLAUDE.md §7: financial invariant tests MUST use a real database — no mocks).
//
// Each test runs against a fresh migrated database via `#[sqlx::test]`. We seed
// real ledger accounts / postings / entries (and wallets where needed), then call
// the production enforcement functions and assert the deterministic pilot code,
// and that a rejected check does not mutate ledger state.

use sqlx::PgPool;

use banzami_compliance::pilot::PilotLimitPolicy;
use banzami_compliance::pilot_enforce::{
    check_funding, check_merchant_receipt, check_volume, Party,
};

const ON: PilotLimitPolicy = PilotLimitPolicy::enabled();
const OFF: PilotLimitPolicy = PilotLimitPolicy::disabled();

async fn new_account(pool: &PgPool) -> uuid::Uuid {
    let id = uuid::Uuid::new_v4();
    sqlx::query("INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1,'LIABILITY',$2,'AOA')")
        .bind(id)
        .bind(format!("acct-{id}"))
        .execute(pool)
        .await
        .unwrap();
    id
}

/// Post a CREDIT of `amount` minor to `account`, dated `days_ago` days back.
async fn credit(pool: &PgPool, account: uuid::Uuid, amount: i64, days_ago: i64) {
    let pid = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key) VALUES ($1,'seed',$2)",
    )
    .bind(pid)
    .bind(format!("idem-{pid}"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ledger_entries (posting_id, account_id, entry_type, amount_minor, currency, created_at) \
         VALUES ($1,$2,'CREDIT',$3,'AOA', now() - ($4 || ' days')::interval)",
    )
    .bind(pid)
    .bind(account)
    .bind(amount)
    .bind(days_ago.to_string())
    .execute(pool)
    .await
    .unwrap();
}

async fn make_merchant_wallet(pool: &PgPool, avail: uuid::Uuid) {
    let reserved = new_account(pool).await;
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) \
         VALUES ($1,$2,'AOA','ACTIVE',$3,$4)",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(uuid::Uuid::new_v4())
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
}

async fn balance(pool: &PgPool, account: uuid::Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)::bigint \
           FROM ledger_entries WHERE account_id=$1",
    )
    .bind(account)
    .fetch_one(pool)
    .await
    .unwrap()
}

// -- merchant per-received (Kz 25.000 = 2_500_000) ------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_per_received_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    // at cap → allowed
    assert!(check_merchant_receipt(&pool, acct, 2_500_000, ON)
        .await
        .unwrap()
        .is_none());
    // over cap → PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED
    let v = check_merchant_receipt(&pool, acct, 2_500_001, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED");
}

// -- merchant daily receiving (Kz 100.000 = 10_000_000) -------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_daily_receiving_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 10_000_000, 0).await; // full daily received today
    let v = check_merchant_receipt(&pool, acct, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED");
}

// -- merchant balance (Kz 100.000 = 10_000_000) ---------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn merchant_balance_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 10_000_000, 2).await; // balance at cap, but NOT today (daily=0)
    let before = balance(&pool, acct).await;
    let v = check_merchant_receipt(&pool, acct, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED");
    // rejected check must not mutate ledger state
    assert_eq!(balance(&pool, acct).await, before);
}

// -- consumer balance (Kz 50.000 = 5_000_000) -----------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn consumer_balance_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    credit(&pool, acct, 5_000_000, 0).await; // at cap
    let v = check_funding(&pool, Party::Consumer, acct, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED");
    // below cap → allowed
    let acct2 = new_account(&pool).await;
    credit(&pool, acct2, 1_000_000, 0).await;
    assert!(check_funding(&pool, Party::Consumer, acct2, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
}

// -- aggregate funds in circulation (Kz 500.000 = 50_000_000) -------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn aggregate_funds_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 50_000_000, 1).await; // full circulation already
    let target = new_account(&pool).await;
    let v = check_funding(&pool, Party::Merchant, target, 1, ON)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED");
}

// -- aggregate transaction volume (Kz 2.000.000 = 200_000_000) ------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn aggregate_volume_over_is_rejected(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 200_000_000, 0).await; // full volume received
    let v = check_volume(&pool, 1, ON).await.unwrap().unwrap();
    assert_eq!(v.as_str(), "PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED");
}

// -- disabled policy is a no-op -------------------------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn disabled_policy_allows_everything(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    credit(&pool, acct, 200_000_000, 0).await;
    assert!(check_merchant_receipt(&pool, acct, i64::MAX / 4, OFF)
        .await
        .unwrap()
        .is_none());
    assert!(
        check_funding(&pool, Party::Consumer, acct, i64::MAX / 4, OFF)
            .await
            .unwrap()
            .is_none()
    );
    assert!(check_volume(&pool, i64::MAX / 4, OFF)
        .await
        .unwrap()
        .is_none());
}

// -- allowed operation below all limits passes ----------------------------------
#[sqlx::test(migrations = "../../db/migrations")]
async fn below_limits_passes(pool: PgPool) {
    let acct = new_account(&pool).await;
    make_merchant_wallet(&pool, acct).await;
    assert!(check_merchant_receipt(&pool, acct, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
    assert!(check_volume(&pool, 1_000_000, ON).await.unwrap().is_none());
    let c = new_account(&pool).await;
    assert!(check_funding(&pool, Party::Consumer, c, 1_000_000, ON)
        .await
        .unwrap()
        .is_none());
}
