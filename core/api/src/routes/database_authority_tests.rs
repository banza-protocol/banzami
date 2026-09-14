//! Only Core has database authority to write canonical financial state.
//!
//! `db/authority/runtime-authority.sql` — generated from the manifest and applied
//! after every Sandbox migration — is applied here to a real database, and then:
//!
//! * every non-Core runtime role is refused INSERT, UPDATE and DELETE on every
//!   financial table **by PostgreSQL privilege** (SQLSTATE 42501, "permission
//!   denied"), while it names itself `banzami-core` — the spoof the 0144
//!   application_name guard alone could not stop;
//! * the same role still reads financial tables and still writes its own;
//! * the Core role may write every financial table, and real Core operations —
//!   a wallet payment to a Business and a P2P transfer — complete on a pool that
//!   connects as that role;
//! * the 0144 guard remains as detection: the Core role connecting under another
//!   name is still refused.
//!
//! Mutation: grant `UPDATE ON wallets` to `bl_gateway_runtime` after the apply
//! and `a_non_core_role_named_core_cannot_write_financial_state` fails on it; put
//! the same grant in the SQL and the SQL's own final assertion aborts the apply.

use axum::{extract::State, Json};
use sqlx::{postgres::PgPoolOptions, Executor, PgPool};

use banzami_types::AccountId;

use super::external_rail_tests::{
    account, balance, book_sums_to_zero, business, funded_consumer, p2p, pay_business,
};
use crate::routes::transfers::{self, SendTransferBody};
use crate::state::{AppState, CoreEnvironment};

/// Core's state on `runtime`, with its system accounts created by the test owner.
async fn state_on(runtime: PgPool, owner: &PgPool) -> AppState {
    AppState::new(
        runtime,
        AccountId::from_uuid(account(owner, "ASSET").await),
        AccountId::from_uuid(account(owner, "ASSET").await),
        AccountId::from_uuid(account(owner, "REVENUE").await),
        CoreEnvironment::Sandbox,
    )
}

const AUTHORITY_SQL: &str = include_str!("../../../../db/authority/runtime-authority.sql");
const AUTHORITY_JSON: &str = include_str!("../../../../db/authority/runtime-authority.json");

const NON_CORE: [&str; 5] = [
    "bl_gateway_runtime",
    "bl_public_api_runtime",
    "bl_developer_api_runtime",
    "bl_admin_api_runtime",
    "bl_app_runtime",
];

fn financial_tables() -> Vec<String> {
    let m: serde_json::Value = serde_json::from_str(AUTHORITY_JSON).unwrap();
    m["financial_tables"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t.as_str().unwrap().to_string())
        .collect()
}

async fn apply_authority(pool: &PgPool) {
    let mut tx = pool.begin().await.unwrap();
    sqlx::raw_sql(AUTHORITY_SQL)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
}

async fn first_column(pool: &PgPool, table: &str) -> String {
    sqlx::query_scalar(
        "SELECT column_name::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position LIMIT 1",
    )
    .bind(table)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// The three write statements, each a no-op on data, each checked for privilege.
async fn writes(pool: &PgPool, table: &str) -> [(&'static str, String); 3] {
    let col = first_column(pool, table).await;
    [
        (
            "INSERT",
            format!("INSERT INTO public.{table} SELECT * FROM public.{table} WHERE false"),
        ),
        (
            "UPDATE",
            format!("UPDATE public.{table} SET {col} = {col} WHERE false"),
        ),
        ("DELETE", format!("DELETE FROM public.{table} WHERE false")),
    ]
}

/// Runs `stmt` as `role` naming itself `app`, and rolls back. Ok, or the SQLSTATE and message.
async fn as_role(pool: &PgPool, role: &str, app: &str, stmt: &str) -> Result<(), (String, String)> {
    let mut tx = pool.begin().await.unwrap();
    tx.execute(format!("SET LOCAL application_name = '{app}'").as_str())
        .await
        .unwrap();
    tx.execute(format!("SET LOCAL ROLE {role}").as_str())
        .await
        .unwrap();
    let r = tx.execute(stmt).await.map(|_| ()).map_err(|e| {
        let db = e.as_database_error().expect("a database error");
        (
            db.code().map(|c| c.to_string()).unwrap_or_default(),
            db.message().to_string(),
        )
    });
    tx.rollback().await.unwrap();
    r
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_non_core_role_named_core_cannot_write_financial_state(pool: PgPool) {
    apply_authority(&pool).await;
    let tables = financial_tables();
    assert_eq!(tables.len(), 25);
    let mut checked = 0;
    for table in &tables {
        for (verb, stmt) in writes(&pool, table).await {
            for role in NON_CORE {
                let r = as_role(&pool, role, "banzami-core", &stmt).await;
                let (code, message) =
                    r.expect_err(&format!("{role} {verb} on {table} must be refused"));
                assert_eq!(
                    code, "42501",
                    "{role} {verb} {table}: refused by privilege, not by a trigger: {message}"
                );
                assert!(
                    message.starts_with("permission denied for table"),
                    "{role} {verb} {table}: the refusal is PostgreSQL's own privilege check, got: {message}"
                );
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 25 * 3 * NON_CORE.len());
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_non_core_role_keeps_its_reads_and_its_own_writes(pool: PgPool) {
    apply_authority(&pool).await;
    for role in NON_CORE {
        as_role(&pool, role, "probe", "SELECT count(*) FROM public.wallets")
            .await
            .unwrap_or_else(|e| panic!("{role} reads financial state: {e:?}"));
    }
    for (role, stmt) in [
        (
            "bl_gateway_runtime",
            "UPDATE public.webhook_events SET id = id WHERE false",
        ),
        (
            "bl_public_api_runtime",
            "DELETE FROM public.sandbox_test_fundings WHERE false",
        ),
        (
            "bl_developer_api_runtime",
            "UPDATE developer.dev_api_keys SET id = id WHERE false",
        ),
        (
            "bl_admin_api_runtime",
            "UPDATE public.kyc_cases SET id = id WHERE false",
        ),
    ] {
        as_role(&pool, role, "probe", stmt)
            .await
            .unwrap_or_else(|e| panic!("{role} writes its own table: {e:?}"));
    }
    // And not another service's.
    let (code, _) = as_role(
        &pool,
        "bl_public_api_runtime",
        "probe",
        "UPDATE public.admin_users SET id = id WHERE false",
    )
    .await
    .expect_err("public-api has no authority over operator accounts");
    assert_eq!(code, "42501");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_core_role_may_write_every_financial_table(pool: PgPool) {
    apply_authority(&pool).await;
    for table in financial_tables() {
        for (verb, stmt) in writes(&pool, &table).await {
            as_role(&pool, "bl_core_runtime", "banzami-core", &stmt)
                .await
                .unwrap_or_else(|e| panic!("Core {verb} on {table}: {e:?}"));
        }
    }
    // The migration ledger is not Core's to change.
    let (code, _) = as_role(
        &pool,
        "bl_core_runtime",
        "banzami-core",
        "DELETE FROM public._sqlx_migrations WHERE false",
    )
    .await
    .expect_err("no runtime role writes the migration ledger");
    assert_eq!(code, "42501");
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn application_name_is_detection_not_authority(pool: PgPool) {
    apply_authority(&pool).await;
    // The Core role under another name is still refused by the 0144 guard.
    let (code, message) = as_role(
        &pool,
        "bl_core_runtime",
        "api-gateway",
        "UPDATE public.wallets SET id = id WHERE false",
    )
    .await
    .expect_err("the guard still detects a writer that does not name itself Core");
    assert_eq!(code, "42501");
    assert!(
        message.contains("FINANCIAL_WRITE_OUTSIDE_CORE"),
        "{message}"
    );
}

/// Real Core operations on a pool whose every connection is the Core role.
#[sqlx::test(migrations = "../../db/migrations")]
async fn core_operations_complete_as_the_core_role(pool: PgPool) {
    apply_authority(&pool).await;
    let options = (*pool.connect_options()).clone();
    let core_pool = PgPoolOptions::new()
        .max_connections(4)
        .after_connect(|conn, _| {
            Box::pin(async move {
                conn.execute("SET ROLE bl_core_runtime").await?;
                conn.execute("SET application_name = 'banzami-core'")
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .unwrap();
    let who: String = sqlx::query_scalar("SELECT current_user::text")
        .fetch_one(&core_pool)
        .await
        .unwrap();
    assert_eq!(who, "bl_core_runtime");

    // Fixtures by the test owner; every movement by Core, as its role.
    let b = business(&pool).await;
    let (payer, from, payer_avail) = funded_consumer(&pool, 100_000).await;
    let (_, to, to_avail) = funded_consumer(&pool, 0).await;
    let state = state_on(core_pool.clone(), &pool).await;

    pay_business(&state, payer, &b, "authority-pay")
        .await
        .expect("a wallet payment to a Business, written by the Core role");
    p2p(&state, &from, &to, "authority-p2p")
        .await
        .expect("a P2P transfer, written by the Core role");
    // The same payment again is idempotent, not a second debit.
    let _replay = transfers::send(
        State(state.clone()),
        Json(SendTransferBody {
            idempotency_key: "authority-pay".into(),
            sender_id: payer.to_string(),
            recipient_id: b.wallet.to_string(),
            amount_minor: 25_000,
            currency: "AOA".into(),
            description: Some("Pedido".into()),
            recipient_account_id: None,
        }),
    )
    .await
    .expect("replay");

    assert_eq!(balance(&pool, payer_avail).await, 100_000 - 25_000 - 5_000);
    assert_eq!(balance(&pool, b.available).await, 25_000);
    assert_eq!(balance(&pool, to_avail).await, 5_000);
    assert!(book_sums_to_zero(&pool).await);

    // And the gateway role, on the same kind of pool, cannot do the same thing.
    let options = (*pool.connect_options()).clone();
    let gateway_pool = PgPoolOptions::new()
        .max_connections(2)
        .after_connect(|conn, _| {
            Box::pin(async move {
                conn.execute("SET ROLE bl_gateway_runtime").await?;
                conn.execute("SET application_name = 'banzami-core'")
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .unwrap();
    let spoofed = state_on(gateway_pool, &pool).await;
    assert!(
        pay_business(&spoofed, payer, &b, "authority-spoof")
            .await
            .is_err(),
        "a non-Core role running Core's own code still cannot move value"
    );
    assert_eq!(balance(&pool, payer_avail).await, 70_000, "nothing moved");
}
