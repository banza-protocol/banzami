//! A synthetic Sandbox Business (ADR-060): provisioned with no operator, honest
//! about what it is, priced and classified by policy, and impossible in LIVE.

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::application_settlements::evaluate_fee_destination;
use crate::routes::sandbox_businesses::{
    change_use_case, derive_handle, kyb_allows_application_fee, provision, ProvisionBody,
    UseCaseBody,
};
use crate::state::{AppState, CoreEnvironment};

async fn state_for(pool: PgPool, env: CoreEnvironment) -> AppState {
    let acct = |name: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO ledger_accounts (id, account_type, name, currency)
                 VALUES ($1,'ASSET',$2,'AOA') RETURNING id",
            )
            .bind(Uuid::new_v4())
            .bind(name)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let (t, b, f) = (acct("t").await, acct("b").await, acct("f").await);
    crate::state::configure_live_secrets_for_tests();
    AppState::new(
        pool,
        AccountId::from_uuid(t),
        AccountId::from_uuid(b),
        AccountId::from_uuid(f),
        env,
    )
}

fn body(project: Uuid, use_case: &str) -> Json<ProvisionBody> {
    Json(ProvisionBody {
        project_id: project.to_string(),
        use_case: use_case.into(),
        project_name: Some("Loja de teste".into()),
    })
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_standard_project_gets_a_synthetic_merchant_on_the_default_profile(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let (_, Json(b)) = provision(State(state), body(project, "STANDARD"))
        .await
        .expect("provisioning should succeed in the Sandbox");

    assert!(b.provisioned);
    assert_eq!(
        b.kyb_status, "SANDBOX_SYNTHETIC",
        "a synthetic Business must never read as reviewed"
    );
    assert_eq!(b.business_account_type, "MERCHANT");
    assert_eq!(b.pricing_profile, "sandbox-default");
    assert_eq!(b.handle, derive_handle(&project.to_string()));

    let m: Uuid = b.merchant_id.parse().unwrap();
    let verified: bool = sqlx::query_scalar("SELECT verified FROM merchants WHERE id = $1")
        .bind(m)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(
        !verified,
        "the verified projection must stay false for a synthetic Business"
    );

    let primary: String = sqlx::query_scalar("SELECT purpose FROM wallet_accounts WHERE id = $1")
        .bind(Uuid::parse_str(&b.wallet_account_id).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(primary, "PRIMARY");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn an_application_project_is_classified_and_priced_by_policy_and_can_take_its_fee(
    pool: PgPool,
) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let (_, Json(b)) = provision(State(state), body(Uuid::new_v4(), "APPLICATION"))
        .await
        .unwrap();
    assert_eq!(b.business_account_type, "APPLICATION");
    assert_eq!(b.pricing_profile, "sandbox-reference");

    let primary_ledger: Uuid =
        sqlx::query_scalar("SELECT account_id FROM wallet_accounts WHERE id = $1")
            .bind(Uuid::parse_str(&b.wallet_account_id).unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();

    let sandbox = evaluate_fee_destination(&pool, AccountId::from_uuid(primary_ledger), false)
        .await
        .unwrap();
    assert!(
        sandbox.kyb_approved,
        "a synthetic APPLICATION Business must be an eligible fee destination in the Sandbox"
    );
    assert_eq!(
        sandbox.blocker, None,
        "unexpected blocker {:?}",
        sandbox.blocker
    );

    // The same record in a LIVE reading is not eligible: the synthetic branch
    // exists only outside LIVE.
    let live = evaluate_fee_destination(&pool, AccountId::from_uuid(primary_ledger), true)
        .await
        .unwrap();
    assert!(!live.kyb_approved);
    assert_eq!(live.blocker, Some("FEE_DESTINATION_KYB_NOT_APPROVED"));
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn provisioning_is_idempotent_per_project(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let (_, Json(a)) = provision(State(state.clone()), body(project, "STANDARD"))
        .await
        .unwrap();
    // A retry, even one naming another use case, finds the same Business and
    // keeps its use case: changing it is a separate operation.
    let (_, Json(b)) = provision(State(state), body(project, "APPLICATION"))
        .await
        .unwrap();
    assert_eq!(a.merchant_id, b.merchant_id);
    assert!(!b.provisioned, "a retry reported creating something");
    assert_eq!(b.use_case, "STANDARD");
    let merchants: i64 = sqlx::query_scalar("SELECT count(*) FROM merchants WHERE email = $1")
        .bind(format!("sandbox+{project}@projects.banzami.test"))
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(merchants, 1);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn concurrent_provisioning_creates_one_business(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let (r1, r2) = tokio::join!(
        provision(State(state.clone()), body(project, "STANDARD")),
        provision(State(state.clone()), body(project, "STANDARD")),
    );
    let (a, b) = (r1.unwrap().1 .0, r2.unwrap().1 .0);
    assert_eq!(a.merchant_id, b.merchant_id);
    let wallets: i64 = sqlx::query_scalar("SELECT count(*) FROM wallets WHERE merchant_id = $1")
        .bind(Uuid::parse_str(&a.merchant_id).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(wallets, 1, "two concurrent requests created two wallets");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn live_refuses_and_writes_nothing(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Live).await;
    let project = Uuid::new_v4();
    assert!(provision(State(state), body(project, "APPLICATION"))
        .await
        .is_err());
    let rows: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sandbox_businesses WHERE project_id = $1")
            .bind(project)
            .fetch_one(&pool)
            .await
            .unwrap();
    let merchants: i64 = sqlx::query_scalar("SELECT count(*) FROM merchants WHERE email = $1")
        .bind(format!("sandbox+{project}@projects.banzami.test"))
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((rows, merchants), (0, 0), "LIVE wrote a synthetic Business");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_recorded_decision_is_never_overwritten(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let (_, Json(b)) = provision(State(state.clone()), body(project, "STANDARD"))
        .await
        .unwrap();
    sqlx::query("UPDATE merchant_compliance SET kyb_status = 'SUSPENDED' WHERE merchant_id = $1")
        .bind(Uuid::parse_str(&b.merchant_id).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let (_, Json(again)) = provision(State(state.clone()), body(project, "STANDARD"))
        .await
        .unwrap();
    assert_eq!(
        again.kyb_status, "SUSPENDED",
        "a retry laundered a SUSPENDED decision"
    );

    // And the use-case policy applies only to synthetic Businesses.
    let err = change_use_case(
        State(state),
        Json(UseCaseBody {
            project_id: project.to_string(),
            use_case: "APPLICATION".into(),
        }),
    )
    .await;
    assert!(
        err.is_err(),
        "a Business that is no longer synthetic was reclassified by policy"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn changing_the_use_case_reclassifies_and_reprices(pool: PgPool) {
    let state = state_for(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let _ = provision(State(state.clone()), body(project, "STANDARD"))
        .await
        .unwrap();
    let Json(b) = change_use_case(
        State(state),
        Json(UseCaseBody {
            project_id: project.to_string(),
            use_case: "APPLICATION".into(),
        }),
    )
    .await
    .unwrap();
    assert_eq!(
        (
            b.use_case.as_str(),
            b.business_account_type.as_str(),
            b.pricing_profile.as_str()
        ),
        ("APPLICATION", "APPLICATION", "sandbox-reference")
    );
}

#[test]
fn only_approved_or_sandbox_synthetic_outside_live_take_a_fee() {
    assert!(kyb_allows_application_fee(false, Some("APPROVED")));
    assert!(kyb_allows_application_fee(true, Some("APPROVED")));
    assert!(kyb_allows_application_fee(false, Some("SANDBOX_SYNTHETIC")));
    assert!(!kyb_allows_application_fee(true, Some("SANDBOX_SYNTHETIC")));
    for s in ["PENDING", "REJECTED", "UNDER_REVIEW", "SUSPENDED"] {
        assert!(
            !kyb_allows_application_fee(false, Some(s)),
            "{s} took a fee"
        );
    }
    assert!(!kyb_allows_application_fee(false, None));
}
