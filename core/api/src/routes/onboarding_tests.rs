//! Phone verification in consumer onboarding.
//!
//! There is no SMS layer, and the test OTP was accepted in every environment:
//! without it the engine stored sha256(""), so an empty code verified — phone
//! ownership was never proven.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::onboarding::{self, StartOnboardingBody, VerifyOtpBody};
use crate::state::{AppState, CoreEnvironment};

async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1, $2, 'acct', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn state(pool: PgPool, env: CoreEnvironment) -> AppState {
    let transit = account(&pool, "ASSET").await;
    let bank = account(&pool, "ASSET").await;
    let fee = account(&pool, "REVENUE").await;
    AppState::new(pool, AccountId::from_uuid(transit), AccountId::from_uuid(bank), AccountId::from_uuid(fee), env)
}

fn start_body(otp: Option<&str>) -> StartOnboardingBody {
    StartOnboardingBody {
        phone_number: "+244912345678".into(),
        currency: "AOA".into(),
        otp_plaintext_for_test: otp.map(str::to_string),
    }
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_test_otp_is_refused_in_live(pool: PgPool) {
    let st = state(pool, CoreEnvironment::Live).await;
    let err = onboarding::start(State(st), Json(start_body(Some("123456"))))
        .await
        .err()
        .expect("LIVE must refuse a caller-chosen OTP");
    assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn no_otp_means_no_verification_is_possible(pool: PgPool) {
    let st = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let err = onboarding::start(State(st), Json(start_body(None)))
        .await
        .err()
        .expect("without an SMS layer a start with no OTP must fail closed");
    assert_eq!(err.code, "OTP_DELIVERY_UNAVAILABLE");
    let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM consumer_onboarding_sessions")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);
    assert_eq!(sessions, 0, "a session was created that anyone could verify with an empty code");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_empty_code_never_verifies(pool: PgPool) {
    let st = state(pool, CoreEnvironment::Sandbox).await;
    let err = onboarding::verify_otp(State(st), Json(VerifyOtpBody { session_id: Uuid::new_v4(), otp_code: String::new() }))
        .await
        .err()
        .expect("an empty code is not a code");
    assert_eq!(err.status, axum::http::StatusCode::BAD_REQUEST);
}
