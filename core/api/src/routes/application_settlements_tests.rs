//! Real-DB route tests for the internal Application Settlement API (ADR-021).
//! Exercises create + complete through the axum handlers over a real pool.

#![allow(clippy::inconsistent_digit_grouping)]

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::application_settlements as routes;
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

/// Fund a LIABILITY available account by inserting a balanced posting directly.
async fn fund(pool: &PgPool, funding_asset: Uuid, account_id: Uuid, amount: i64) {
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
    for (acc, ty) in [(funding_asset, "DEBIT"), (account_id, "CREDIT")] {
        sqlx::query(
            "INSERT INTO ledger_entries
               (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
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

async fn seed_rule(pool: &PgPool, category: &str, bps: i32) {
    sqlx::query(
        "INSERT INTO pricing_rules (id, rule_key, business_category, rate_bps, environment)
         VALUES ($1, $2, $3, $4, 'SANDBOX')",
    )
    .bind(Uuid::new_v4())
    .bind(format!("rule-{category}"))
    .bind(category)
    .bind(bps)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn create_then_complete_via_api(pool: PgPool) -> sqlx::Result<()> {
    seed_rule(&pool, "CROWDFUNDING", 500).await; // 5%
    let funding = account(&pool, "ASSET", "Funding").await;
    let source = account(&pool, "LIABILITY", "Campaign").await;
    let beneficiary = account(&pool, "LIABILITY", "Beneficiary").await;
    let app_fee = account(&pool, "LIABILITY", "AppFee").await;
    fund(&pool, funding, source, 98_000).await;

    let state = build_state(pool.clone()).await;

    // create — references only, never a fee
    let (status, Json(created)) = routes::create(
        State(state.clone()),
        Json(serde_json::from_value(serde_json::json!({
            "idempotency_key": "as-route-1",
            "owner_ref": "campaign_1",
            "source_account_id": source.to_string(),
            "beneficiary_account_id": beneficiary.to_string(),
            "application_fee_account_id": app_fee.to_string(),
            "gross_amount_minor": 98_000,
            "currency": "AOA",
            "business_category": "CROWDFUNDING"
        }))
        .unwrap()),
    )
    .await
    .unwrap();
    assert_eq!(status, axum::http::StatusCode::CREATED);
    assert_eq!(created["status"], "CREATED");
    assert_eq!(created["application_fee"]["amount_minor"], 4_900);
    assert_eq!(created["net_amount"]["amount_minor"], 93_100);
    let id = created["id"].as_str().unwrap().to_string();

    // complete — posts the balanced ledger entries
    let Json(done) = routes::complete(State(state), Path(id)).await.unwrap();
    assert_eq!(done["status"], "COMPLETED");
    assert!(done["settlement_posting_id"].is_string());

    // beneficiary credited the net
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(beneficiary)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(net, 93_100);
    Ok(())
}
