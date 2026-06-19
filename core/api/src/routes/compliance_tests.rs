//! DB-backed tests proving KYC/KYB compliance decisions are written to the
//! immutable audit log (vendor-agnostic prep — no vendor, simulated provider).

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::routes::compliance;
use crate::state::{AppState, CoreEnvironment};
use banzami_types::AccountId;

async fn ledger_account(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency)
         VALUES ($1, 'ASSET', $2, 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn build_state(pool: PgPool) -> AppState {
    let transit = ledger_account(&pool, "transit").await;
    let bank = ledger_account(&pool, "bank").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        CoreEnvironment::Sandbox,
    )
}

async fn audit_count(pool: &PgPool, action: &str, subject: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM audit_log WHERE action = $1 AND subject = $2",
    )
    .bind(action)
    .bind(subject)
    .fetch_one(pool)
    .await
    .unwrap()
}

// Approving a merchant's KYB writes exactly one KYC_STATUS_CHANGED audit entry.
#[sqlx::test(migrations = "../../db/migrations")]
async fn approve_merchant_is_audited(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let merchant = Uuid::new_v4();

    // Ensure a compliance record exists (PENDING), then approve.
    let _ = compliance::get_merchant(State(state.clone()), Path(merchant.to_string())).await;
    let _ = compliance::approve_merchant(State(state), Path(merchant.to_string()))
        .await
        .expect("approve");

    assert_eq!(
        audit_count(&pool, "KYC_STATUS_CHANGED", &format!("merchant:{merchant}")).await,
        1,
        "KYB approval audited exactly once"
    );
}

// A consumer KYC verification writes exactly one KYC_STATUS_CHANGED audit entry.
#[sqlx::test(migrations = "../../db/migrations")]
async fn verify_customer_is_audited(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    let customer = Uuid::new_v4();

    let body = compliance::VerifyCustomerBody {
        full_name: "Test User".into(),
        document_type: Some("CARTA_DE_CONDUCAO".into()), // exercises the new doc type
        document_number: "006887496LA042".into(),
        date_of_birth: "1990-01-01".parse().unwrap(),
        requested_level: Some("BASIC".into()),
    };
    let _ = compliance::verify_customer(State(state), Path(customer.to_string()), Json(body))
        .await
        .expect("verify customer (simulated)");

    assert_eq!(
        audit_count(&pool, "KYC_STATUS_CHANGED", &format!("consumer:{customer}")).await,
        1,
        "consumer KYC decision audited exactly once"
    );
}
