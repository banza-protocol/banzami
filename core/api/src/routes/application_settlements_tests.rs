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

/// ADR-028: seed a Business Account — a merchant of `account_type` with `kyb`
/// status and an ACTIVE wallet. Returns (merchant_id, wallet available account),
/// the latter being a candidate application-fee destination.
async fn seed_business_account(pool: &PgPool, account_type: &str, kyb: &str) -> (Uuid, Uuid) {
    let mid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO merchants (id, name, email, status, business_account_type)
         VALUES ($1, $2, $3, 'ACTIVE', $4)",
    )
    .bind(mid)
    .bind(format!("BA {}", &mid.to_string()[..8]))
    .bind(format!("ba-{mid}@example.ao"))
    .bind(account_type)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status)
         VALUES ($1, $2, 'APPROVED')",
    )
    .bind(mid)
    .bind(kyb)
    .execute(pool)
    .await
    .unwrap();
    let avail = account(pool, "LIABILITY", "ba-available").await;
    let reserved = account(pool, "LIABILITY", "ba-reserved").await;
    sqlx::query(
        "INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id)
         VALUES ($1, $2, 'AOA', 'ACTIVE', $3, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(mid)
    .bind(avail)
    .bind(reserved)
    .execute(pool)
    .await
    .unwrap();
    (mid, avail)
}

/// Seed a SETTLEMENT rule.
///
/// It names its operation, because under the V2 resolver a rule that does not
/// applies to nothing rather than to everything — which is what stops a future
/// fee-bearing operation inheriting a rate nobody chose for it. Without the
/// operation this test got a 409 PRICING_NOT_CONFIGURED, correctly.
///
/// No profile, so it prices every profile: this route test is about the HTTP
/// contract, not about which owner is on which plan.
async fn seed_rule(pool: &PgPool, category: &str, bps: i32) {
    sqlx::query(
        "INSERT INTO pricing_rules
           (id, rule_key, business_category, rate_bps, environment, pricing_operation)
         VALUES ($1, $2, $3, $4, 'SANDBOX', 'SETTLEMENT')",
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
    // ADR-028: the application-fee destination must be a validated Business Account
    // (KYB-approved, APPLICATION type) — model @doa.
    let (_doa, app_fee) = seed_business_account(&pool, "APPLICATION", "APPROVED").await;
    fund(&pool, funding, source, 98_000).await;

    let state = build_state(pool.clone()).await;

    // create — references only, never a fee
    let (status, Json(created)) = routes::create(
        State(state.clone()),
        Json(
            serde_json::from_value(serde_json::json!({
                "idempotency_key": "as-route-1",
                "owner_ref": "campaign_1",
                "source_account_id": source.to_string(),
                "beneficiary_account_id": beneficiary.to_string(),
                "application_fee_account_id": app_fee.to_string(),
                "gross_amount_minor": 98_000,
                "currency": "AOA",
                "business_category": "CROWDFUNDING"
            }))
            .unwrap(),
        ),
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

// ---------------------------------------------------------------------------
// ADR-028 — application-fee destination guard
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_guard_accepts_approved_application(pool: PgPool) {
    let (_m, fee) = seed_business_account(&pool, "APPLICATION", "APPROVED").await;
    routes::guard_application_fee_destination(&pool, AccountId::from_uuid(fee))
        .await
        .expect("approved APPLICATION business account is a valid fee destination");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_guard_rejects_plain_merchant_type(pool: PgPool) {
    let (_m, fee) = seed_business_account(&pool, "MERCHANT", "APPROVED").await;
    let e = routes::guard_application_fee_destination(&pool, AccountId::from_uuid(fee))
        .await
        .unwrap_err();
    assert!(format!("{e:?}").contains("TYPE_NOT_ALLOWED"), "got {e:?}");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_guard_rejects_unapproved_kyb(pool: PgPool) {
    let (_m, fee) = seed_business_account(&pool, "APPLICATION", "PENDING").await;
    let e = routes::guard_application_fee_destination(&pool, AccountId::from_uuid(fee))
        .await
        .unwrap_err();
    assert!(format!("{e:?}").contains("KYB_NOT_APPROVED"), "got {e:?}");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn fee_guard_rejects_non_business_account(pool: PgPool) {
    // A bare ledger account that belongs to no Business Account.
    let orphan = account(&pool, "LIABILITY", "orphan").await;
    let e = routes::guard_application_fee_destination(&pool, AccountId::from_uuid(orphan))
        .await
        .unwrap_err();
    assert!(
        format!("{e:?}").contains("NOT_BUSINESS_ACCOUNT"),
        "got {e:?}"
    );
}
