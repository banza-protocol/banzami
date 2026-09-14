//! Deleting a Sandbox Project in Core: its test resources retired through
//! balanced postings, nothing rewritten, safe to run again, never reaching a
//! Business another Project uses, and nothing created afterwards.
//!
//! Mutation: make `retire` zero a balance with an UPDATE instead of
//! `retire_in_tx` and the 0144 guard / immutability triggers refuse it; drop the
//! `retire_business` condition and `a_shared_business_is_never_retired` fails;
//! drop the retired check in `link_project` and `a_deleted_project_creates_nothing`
//! fails; key a pass's postings without the pass id and the late-credit pass
//! posts nothing (`a_later_pass_retires_only_what_arrived_since`).

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use super::sandbox_reset_tests::{balance, business, count, fund, state, test_payer};
use crate::routes::sandbox_project_deletion::{retire, RetireProjectBody};
use crate::state::CoreEnvironment;

fn body(project: Uuid, pass: &str, retire_business: bool) -> Json<RetireProjectBody> {
    Json(RetireProjectBody {
        project_id: project.to_string(),
        requested_by: "dev-user".into(),
        pass_id: pass.into(),
        retire_business,
    })
}

async fn status(pool: &PgPool, sql: &str, id: Uuid) -> String {
    sqlx::query_scalar(sql)
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn book_balanced(pool: &PgPool) -> bool {
    count(
        pool,
        "SELECT count(*) FROM (SELECT posting_id FROM ledger_entries GROUP BY posting_id
           HAVING SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0) u",
    )
    .await
        == 0
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn deleting_retires_what_the_project_owns_through_postings(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let f = business(&st, &pool, transit, project).await;
    let (payer, payer_avail) = test_payer(&pool, transit, project, 800_000).await;
    let endpoint: Uuid = sqlx::query_scalar(
        "INSERT INTO webhook_endpoints (merchant_id, url, events, secret, environment) VALUES ($1, 'https://example.test/h', '{*}', 's', 'SANDBOX') RETURNING id",
    )
    .bind(f.merchant)
    .fetch_one(&pool)
    .await
    .unwrap();
    let event: Uuid = sqlx::query_scalar(
        "INSERT INTO webhook_events (merchant_id, event_type, payload) VALUES ($1, 'payment_session.paid', '{}') RETURNING id",
    )
    .bind(f.merchant)
    .fetch_one(&pool)
    .await
    .unwrap();
    let delivery: Uuid = sqlx::query_scalar(
        "INSERT INTO webhook_deliveries (event_id, endpoint_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(event)
    .bind(endpoint)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO sandbox_project_rail_states (project_id, merchant_id, state) VALUES ($1, $2, 'UNAVAILABLE')")
        .bind(project)
        .bind(f.merchant)
        .execute(&pool)
        .await
        .unwrap();
    let postings_before = count(&pool, "SELECT count(*) FROM ledger_postings").await;
    let entries_before = count(&pool, "SELECT count(*) FROM ledger_entries").await;

    let Json(out) = retire(State(st.clone()), body(project, "p1", true))
        .await
        .unwrap();
    assert_eq!(out["test_payers_retired"], 1);
    assert_eq!(out["business_retired"], true);
    assert_eq!(out["retired_minor"], 1_145_000);
    assert_eq!(out["business"]["suspended"], true);
    assert_eq!(out["business"]["webhook_endpoints_disabled"], 1);
    assert_eq!(out["business"]["pending_deliveries_ended"], 1);

    for acct in [f.primary_account, f.segregated_ledger, payer_avail, transit] {
        assert_eq!(
            balance(&pool, acct).await,
            0,
            "fictitious value returned through postings"
        );
    }
    assert!(book_balanced(&pool).await);
    assert!(count(&pool, "SELECT count(*) FROM ledger_postings").await > postings_before);
    assert!(
        count(&pool, "SELECT count(*) FROM ledger_entries").await >= entries_before + 6,
        "history is added to, never removed"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM payment_sessions WHERE id=$1",
            f.session
        )
        .await,
        "CANCELLED"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM payment_links WHERE id=$1",
            f.link
        )
        .await,
        "CANCELLED"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM wallet_accounts WHERE id=$1",
            f.segregated
        )
        .await,
        "CLOSED"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM merchants WHERE id=$1",
            f.merchant
        )
        .await,
        "SUSPENDED"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT active::text FROM webhook_endpoints WHERE id=$1",
            endpoint
        )
        .await,
        "false"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM webhook_deliveries WHERE id=$1",
            delivery
        )
        .await,
        "FAILED"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT (retired_at IS NOT NULL)::text FROM sandbox_test_payers WHERE consumer_id=$1",
            payer
        )
        .await,
        "true"
    );
    assert_eq!(
        count(&pool, "SELECT count(*) FROM sandbox_project_rail_states").await,
        0
    );
    assert_eq!(
        status(
            &pool,
            "SELECT kyb_status FROM merchant_compliance WHERE merchant_id=$1",
            f.merchant
        )
        .await,
        "SANDBOX_SYNTHETIC",
        "what the Business was is not rewritten"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_later_pass_retires_only_what_arrived_since(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let f = business(&st, &pool, transit, project).await;
    let (_, payer_avail) = test_payer(&pool, transit, project, 50_000).await;
    let _ = retire(State(st.clone()), body(project, "p1", true))
        .await
        .unwrap();

    // The same pass again, and a new pass with nothing new: nothing posted.
    let entries = count(&pool, "SELECT count(*) FROM ledger_entries").await;
    let _ = retire(State(st.clone()), body(project, "p1", true))
        .await
        .unwrap();
    let Json(second) = retire(State(st.clone()), body(project, "p2", true))
        .await
        .unwrap();
    assert_eq!(second["retired_minor"], 0);
    assert_eq!(
        count(&pool, "SELECT count(*) FROM ledger_entries").await,
        entries,
        "no double cleanup"
    );
    assert_eq!(
        count(&pool, "SELECT passes::bigint FROM sandbox_retired_projects").await,
        3
    );

    // Value that arrived after the first pass (a credit already in flight) is
    // retired once by the next pass.
    fund(&pool, transit, f.primary_account, 7_000).await;
    let Json(third) = retire(State(st.clone()), body(project, "p3", true))
        .await
        .unwrap();
    assert_eq!(third["retired_minor"], 7_000);
    assert_eq!(balance(&pool, f.primary_account).await, 0);
    assert_eq!(balance(&pool, payer_avail).await, 0);
    assert_eq!(balance(&pool, transit).await, 0);
    assert!(book_balanced(&pool).await);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_shared_business_is_never_retired(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let owner = Uuid::new_v4();
    let f = business(&st, &pool, transit, owner).await;
    let (_, owner_payer) = test_payer(&pool, transit, owner, 20_000).await;
    // A link the owner Project created on its Business.
    let (_, Json(link)) = crate::routes::payment_links::create(
        State(st.clone()),
        Json(crate::routes::payment_links::CreateBody {
            merchant_id: f.merchant.to_string(),
            wallet_id: f.wallet.to_string(),
            wallet_account_id: None,
            amount_minor: Some(1_000),
            currency: "AOA".into(),
            description: None,
            expires_at: None,
            sandbox_project_id: Some(owner.to_string()),
        }),
    )
    .await
    .unwrap();
    let owner_link = Uuid::parse_str(&link.id).unwrap();

    // Another live Project still uses the Business: developer-api says so.
    let Json(out) = retire(State(st.clone()), body(owner, "p1", false))
        .await
        .unwrap();
    assert_eq!(out["business_owned"], true);
    assert_eq!(out["business_retired"], false);
    assert_eq!(
        balance(&pool, owner_payer).await,
        0,
        "the deleted Project's own payer is retired"
    );
    assert_eq!(
        balance(&pool, f.primary_account).await,
        300_000,
        "the shared Business keeps its value"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM merchants WHERE id=$1",
            f.merchant
        )
        .await,
        "ACTIVE"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM payment_links WHERE id=$1",
            owner_link
        )
        .await,
        "CANCELLED",
        "what the deleted Project created is closed"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM payment_links WHERE id=$1",
            f.link
        )
        .await,
        "ACTIVE",
        "what others created on the Business stays usable"
    );
    assert_eq!(
        status(
            &pool,
            "SELECT status FROM payment_sessions WHERE id=$1",
            f.session
        )
        .await,
        "ACTIVE"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_deleted_project_creates_nothing(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let f = business(&st, &pool, transit, project).await;
    let other = Uuid::new_v4();
    let _ = retire(State(st.clone()), body(project, "p1", false))
        .await
        .unwrap();

    let link = |p: Uuid| crate::routes::payment_links::CreateBody {
        merchant_id: f.merchant.to_string(),
        wallet_id: f.wallet.to_string(),
        wallet_account_id: None,
        amount_minor: Some(1_000),
        currency: "AOA".into(),
        description: None,
        expires_at: None,
        sandbox_project_id: Some(p.to_string()),
    };
    let Err(err) =
        crate::routes::payment_links::create(State(st.clone()), Json(link(project))).await
    else {
        panic!("a request authorised just before the keys were revoked creates nothing");
    };
    assert_eq!((err.status.as_u16(), err.code), (409, "RESOURCE_DELETING"));
    let _ = crate::routes::payment_links::create(State(st.clone()), Json(link(other)))
        .await
        .expect("another Project is unaffected");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn deletion_retirement_is_sandbox_only(pool: PgPool) {
    let (st, _) = state(pool.clone(), CoreEnvironment::Live).await;
    let err = retire(State(st), body(Uuid::new_v4(), "p1", true))
        .await
        .expect_err("LIVE has no disposable resources");
    assert_eq!(err.status.as_u16(), 403);
    assert_eq!(
        count(&pool, "SELECT count(*) FROM sandbox_retired_projects").await,
        0
    );
}
