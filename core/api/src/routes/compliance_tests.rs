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
    let operator_fee = ledger_account(&pool, "operator-fee-revenue").await;
    AppState::new(
        pool,
        AccountId::from_uuid(transit),
        AccountId::from_uuid(bank),
        AccountId::from_uuid(operator_fee),
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

async fn statuses(pool: &PgPool, merchant: Uuid) -> (String, String) {
    sqlx::query_as("SELECT kyb_status, aml_status FROM merchant_compliance WHERE merchant_id = $1")
        .bind(merchant)
        .fetch_one(pool)
        .await
        .unwrap()
}

fn notes(n: &str) -> Json<compliance::NotesBody> {
    Json(compliance::NotesBody { notes: n.into() })
}

// A5-06. "Approve" set KYB and AML to APPROVED whatever they were: it lifted a
// suspension, and it cleared an AML review flag, with no reason and no trace of
// the flag. Approval is refused while suspended and leaves an AML flag standing.
#[sqlx::test(migrations = "../../db/migrations")]
async fn approval_does_not_lift_a_suspension_or_clear_an_aml_flag(pool: PgPool) {
    let state = build_state(pool.clone()).await;

    let suspended = Uuid::new_v4();
    sqlx::query("INSERT INTO merchants (id, name, email, status) VALUES ($1,'s',$2,'ACTIVE')")
        .bind(suspended)
        .bind(format!("{suspended}@compliance.test"))
        .execute(&pool)
        .await
        .unwrap();
    let _ = compliance::suspend_merchant(
        State(state.clone()),
        Path(suspended.to_string()),
        notes("fraude"),
    )
    .await
    .unwrap();
    assert!(
        compliance::approve_merchant(State(state.clone()), Path(suspended.to_string()))
            .await
            .is_err(),
        "approval lifted a suspension"
    );
    assert_eq!(
        statuses(&pool, suspended).await,
        ("SUSPENDED".into(), "SUSPENDED".into())
    );

    let flagged = Uuid::new_v4();
    let _ = compliance::flag_aml(
        State(state.clone()),
        Path(flagged.to_string()),
        notes("padrão suspeito"),
    )
    .await
    .unwrap();
    let _ = compliance::approve_merchant(State(state.clone()), Path(flagged.to_string()))
        .await
        .unwrap();
    assert_eq!(
        statuses(&pool, flagged).await,
        ("APPROVED".into(), "UNDER_REVIEW".into()),
        "approving KYB cleared the AML flag"
    );
}

// Decisions on different columns do not erase each other: a KYB rejection and
// an AML flag racing both stand.
#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_decisions_on_different_columns_both_stand(pool: PgPool) {
    let state = build_state(pool.clone()).await;
    for _ in 0..5 {
        let m = Uuid::new_v4();
        let _ = compliance::get_merchant(State(state.clone()), Path(m.to_string())).await;
        let (a, b) = tokio::join!(
            compliance::reject_merchant(
                State(state.clone()),
                Path(m.to_string()),
                notes("documentos")
            ),
            compliance::flag_aml(State(state.clone()), Path(m.to_string()), notes("padrão")),
        );
        let _ = a.unwrap();
        let _ = b.unwrap();
        assert_eq!(
            statuses(&pool, m).await,
            ("REJECTED".into(), "UNDER_REVIEW".into())
        );
    }
}
