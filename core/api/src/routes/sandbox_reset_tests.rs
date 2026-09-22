//! A Sandbox reset: live test data stops, history stays, and only what the
//! Project owns is touched (ADR-060 §10).

use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use banzami_types::AccountId;

use crate::routes::sandbox_businesses::{provision, ProvisionBody};
use crate::routes::sandbox_reset::{reset, ResetBody, RESETS_PER_DAY};
use crate::state::{AppState, CoreEnvironment};

pub(super) async fn account(pool: &PgPool, ty: &str) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1, $2, 'a', 'AOA') RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(ty)
    .fetch_one(pool)
    .await
    .unwrap()
}

pub(super) async fn state(pool: PgPool, env: CoreEnvironment) -> (AppState, Uuid) {
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

pub(super) async fn balance(pool: &PgPool, acct: Uuid) -> i64 {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END),0)::BIGINT FROM ledger_entries WHERE account_id=$1",
    )
    .bind(acct)
    .fetch_one(pool)
    .await
    .unwrap()
}

pub(super) async fn fund(pool: &PgPool, transit: Uuid, to: Uuid, amount: i64) {
    let p = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id,description,idempotency_key) VALUES ($1,'fund',$2)",
    )
    .bind(p)
    .bind(format!("fund-{p}"))
    .execute(pool)
    .await
    .unwrap();
    for (a, t) in [(transit, "DEBIT"), (to, "CREDIT")] {
        sqlx::query("INSERT INTO ledger_entries (id,posting_id,account_id,entry_type,amount_minor,currency) VALUES ($1,$2,$3,$4,$5,'AOA')")
            .bind(Uuid::new_v4()).bind(p).bind(a).bind(t).bind(amount).execute(pool).await.unwrap();
    }
}

pub(super) struct Fixture {
    pub(super) merchant: Uuid,
    pub(super) wallet: Uuid,
    pub(super) primary_account: Uuid,
    pub(super) segregated: Uuid,
    pub(super) segregated_ledger: Uuid,
    pub(super) session: Uuid,
    pub(super) link: Uuid,
}

/// A Project's synthetic Business, funded, with an extra account, an open
/// session and an active link.
pub(super) async fn business(
    st: &AppState,
    pool: &PgPool,
    transit: Uuid,
    project: Uuid,
) -> Fixture {
    let (_, Json(b)) = provision(
        State(st.clone()),
        Json(ProvisionBody {
            project_id: project.to_string(),
            use_case: "STANDARD".into(),
            project_name: Some("Reset".into()),
        }),
    )
    .await
    .unwrap();
    let merchant = Uuid::parse_str(&b.merchant_id).unwrap();
    let wallet = Uuid::parse_str(&b.wallet_id).unwrap();
    let primary_account: Uuid =
        sqlx::query_scalar("SELECT available_account_id FROM wallets WHERE id=$1")
            .bind(wallet)
            .fetch_one(pool)
            .await
            .unwrap();
    fund(pool, transit, primary_account, 300_000).await;
    let segregated_ledger = account(pool, "LIABILITY").await;
    let segregated: Uuid = sqlx::query_scalar(
        "INSERT INTO wallet_accounts (wallet_id, account_id, merchant_id, currency, purpose, label, reference_type, reference_id)
         VALUES ($1,$2,$3,'AOA','CAMPAIGN','Campanha','T',$4) RETURNING id",
    )
    .bind(wallet).bind(segregated_ledger).bind(merchant).bind(Uuid::new_v4().to_string())
    .fetch_one(pool).await.unwrap();
    fund(pool, transit, segregated_ledger, 45_000).await;
    let session: Uuid = sqlx::query_scalar(
        "INSERT INTO payment_sessions (merchant_id, wallet_id, wallet_account_id, currency, status) VALUES ($1,$2,$3,'AOA','ACTIVE') RETURNING id",
    )
    .bind(merchant).bind(wallet).bind(segregated).fetch_one(pool).await.unwrap();
    let link = Uuid::new_v4();
    sqlx::query("INSERT INTO payment_links (id, slug, merchant_id, wallet_id, currency, environment, status) VALUES ($1,$2,$3,$4,'AOA','SANDBOX','ACTIVE')")
        .bind(link).bind(format!("s{}", &link.simple().to_string()[..10])).bind(merchant).bind(wallet)
        .execute(pool).await.unwrap();
    Fixture {
        merchant,
        wallet,
        primary_account,
        segregated,
        segregated_ledger,
        session,
        link,
    }
}

pub(super) async fn test_payer(
    pool: &PgPool,
    transit: Uuid,
    project: Uuid,
    amount: i64,
) -> (Uuid, Uuid) {
    let consumer: Uuid = sqlx::query_scalar(
        "INSERT INTO consumers (handle, display_name) VALUES ($1, 'Test Consumer') RETURNING id",
    )
    .bind(format!("tp{}", &Uuid::new_v4().simple().to_string()[..10]))
    .fetch_one(pool)
    .await
    .unwrap();
    let avail = account(pool, "LIABILITY").await;
    let reserved = account(pool, "LIABILITY").await;
    sqlx::query("INSERT INTO consumer_wallets (consumer_id, currency, available_account_id, reserved_account_id) VALUES ($1,'AOA',$2,$3)")
        .bind(consumer).bind(avail).bind(reserved).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO sandbox_test_payers (consumer_id, project_id) VALUES ($1,$2)")
        .bind(consumer)
        .bind(project)
        .execute(pool)
        .await
        .unwrap();
    fund(pool, transit, avail, amount).await;
    (consumer, avail)
}

fn body(project: Uuid, key: &str) -> Json<ResetBody> {
    Json(ResetBody {
        project_id: project.to_string(),
        requested_by: "dev-user".into(),
        idempotency_key: key.into(),
    })
}

pub(super) async fn count(pool: &PgPool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_reset_stops_live_test_data_and_keeps_every_record(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    let f = business(&st, &pool, transit, project).await;
    let (payer, payer_avail) = test_payer(&pool, transit, project, 800_000).await;
    let entries_before = count(&pool, "SELECT count(*) FROM ledger_entries").await;
    assert_eq!(balance(&pool, transit).await, -1_145_000);

    let Json(out) = reset(State(st.clone()), body(project, "reset-1"))
        .await
        .unwrap();
    let r = &out["result"];
    assert_eq!(r["test_payers_retired"], 1);
    assert_eq!(r["business_reset"], true);
    assert_eq!(r["payment_sessions_cancelled"], 1);
    assert_eq!(r["payment_links_cancelled"], 1);
    assert_eq!(r["accounts_closed"], 1);
    assert_eq!(r["retired_minor"], 1_145_000);

    // Fictitious value went back where it was issued from, through postings.
    for acct in [f.primary_account, f.segregated_ledger, payer_avail, transit] {
        assert_eq!(balance(&pool, acct).await, 0);
    }
    assert!(
        count(&pool, "SELECT count(*) FROM ledger_entries").await >= entries_before + 6,
        "nothing is deleted; retirement adds postings"
    );

    let status = |sql: &'static str, id: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(sql)
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    assert_eq!(
        status("SELECT status FROM payment_sessions WHERE id=$1", f.session).await,
        "CANCELLED"
    );
    assert_eq!(
        status("SELECT status FROM payment_links WHERE id=$1", f.link).await,
        "CANCELLED"
    );
    assert_eq!(
        status(
            "SELECT status FROM wallet_accounts WHERE id=$1",
            f.segregated
        )
        .await,
        "CLOSED"
    );
    let primary_status: String = sqlx::query_scalar(
        "SELECT status FROM wallet_accounts WHERE wallet_id=$1 AND purpose='PRIMARY'",
    )
    .bind(f.wallet)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        primary_status, "ACTIVE",
        "the PRIMARY account is the wallet's own and is never closed"
    );
    let retired: bool = sqlx::query_scalar(
        "SELECT retired_at IS NOT NULL FROM sandbox_test_payers WHERE consumer_id=$1",
    )
    .bind(payer)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(retired);
    let kyb: String =
        sqlx::query_scalar("SELECT kyb_status FROM merchant_compliance WHERE merchant_id=$1")
            .bind(f.merchant)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        kyb, "SANDBOX_SYNTHETIC",
        "a reset never changes what the Business is"
    );

    // The same request again: the same answer, nothing new posted.
    let entries_after = count(&pool, "SELECT count(*) FROM ledger_entries").await;
    let Json(again) = reset(State(st.clone()), body(project, "reset-1"))
        .await
        .unwrap();
    assert_eq!(again["replayed"], true);
    assert_eq!(
        count(&pool, "SELECT count(*) FROM ledger_entries").await,
        entries_after
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_reset_touches_only_what_the_project_owns(pool: PgPool) {
    let (st, transit) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let owner = Uuid::new_v4();
    let f = business(&st, &pool, transit, owner).await;
    // Another Project, connected to the owner's Business, with its own payer.
    let connected = Uuid::new_v4();
    let (_, other_payer) = test_payer(&pool, transit, connected, 10_000).await;
    let (_, owner_payer) = test_payer(&pool, transit, owner, 20_000).await;

    let Json(out) = reset(State(st.clone()), body(connected, "k"))
        .await
        .unwrap();
    assert_eq!(out["result"]["business_reset"], false);
    assert_eq!(out["result"]["test_payers_retired"], 1);
    assert_eq!(balance(&pool, other_payer).await, 0);
    assert_eq!(
        balance(&pool, owner_payer).await,
        20_000,
        "another Project's payer is not this Project's to reset"
    );
    assert_eq!(
        balance(&pool, f.primary_account).await,
        300_000,
        "a connected Project cannot reset the Business it receives into"
    );
    let session: String = sqlx::query_scalar("SELECT status FROM payment_sessions WHERE id=$1")
        .bind(f.session)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session, "ACTIVE");

    // A Business that is not SANDBOX_SYNTHETIC is never reset, even by its row's Project.
    sqlx::query("UPDATE merchant_compliance SET kyb_status='APPROVED' WHERE merchant_id=$1")
        .bind(f.merchant)
        .execute(&pool)
        .await
        .unwrap();
    let Json(out) = reset(State(st.clone()), body(owner, "k2")).await.unwrap();
    assert_eq!(out["result"]["business_reset"], false);
    assert_eq!(balance(&pool, f.primary_account).await, 300_000);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_reset_is_sandbox_only_and_limited(pool: PgPool) {
    let (live, _) = state(pool.clone(), CoreEnvironment::Live).await;
    assert!(
        reset(State(live), body(Uuid::new_v4(), "k")).await.is_err(),
        "LIVE refuses"
    );

    let (st, _) = state(pool.clone(), CoreEnvironment::Sandbox).await;
    let project = Uuid::new_v4();
    for i in 0..RESETS_PER_DAY {
        let _ = reset(State(st.clone()), body(project, &format!("k{i}")))
            .await
            .unwrap();
    }
    let err = reset(State(st.clone()), body(project, "one-more"))
        .await
        .expect_err("the sixth reset in a day is refused");
    assert!(format!("{err:?}").contains("SANDBOX_RESET_LIMIT"));
}
