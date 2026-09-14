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

// ── indirect write authority (WALLET-NATIVE-001 closure) ─────────────────────
//
// The direct grants above are necessary, not sufficient. A non-Core role could
// still reach financial state through a SECURITY DEFINER routine, a role it may
// SET, TRUNCATE, a rule or INSTEAD OF trigger, a writable view, an object it
// creates for a privileged routine to resolve, or a default privilege a future
// migration inherits. `verify-authority.sql` checks every one against the live
// catalog; each mutation below introduces one path inside a transaction that is
// rolled back (roles are cluster-wide) and requires the verification to name it.

const VERIFY_SQL: &str = include_str!("../../../../db/authority/verify-authority.sql");

async fn verify_in(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<(), String> {
    sqlx::raw_sql(VERIFY_SQL)
        .execute(&mut **tx)
        .await
        .map(|_| ())
        .map_err(|e| {
            e.as_database_error()
                .map(|d| d.message().to_string())
                .unwrap_or_else(|| e.to_string())
        })
}

/// Applies `mutation` and verifies, all in one rolled-back transaction.
async fn verify_after(pool: &PgPool, mutation: &str) -> Result<(), String> {
    let mut tx = pool.begin().await.unwrap();
    sqlx::raw_sql(mutation).execute(&mut *tx).await.unwrap();
    let r = verify_in(&mut tx).await;
    tx.rollback().await.unwrap();
    r
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn the_applied_authority_verifies_clean(pool: PgPool) {
    apply_authority(&pool).await;
    let mut tx = pool.begin().await.unwrap();
    verify_in(&mut tx)
        .await
        .expect("no direct or indirect path after the apply");
    tx.rollback().await.unwrap();
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn every_indirect_write_path_is_named_by_the_verification(pool: PgPool) {
    apply_authority(&pool).await;
    let cases: [(&str, &str, &str); 8] = [
        (
            "A: a SECURITY DEFINER financial writer executable by the gateway",
            "CREATE FUNCTION public.bz_mut_writer() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.wallets SET id = id WHERE false $$;
             REVOKE ALL ON FUNCTION public.bz_mut_writer() FROM PUBLIC;
             GRANT EXECUTE ON FUNCTION public.bz_mut_writer() TO bl_gateway_runtime;",
            "UNSAFE_SECURITY_DEFINER_FUNCTIONS",
        ),
        (
            "B: the gateway made a member of Core",
            "GRANT bl_core_runtime TO bl_gateway_runtime;",
            "NON_CORE_PRIVILEGE_ESCALATION_ROLE_PATHS",
        ),
        (
            "C: TRUNCATE on a financial table",
            "GRANT TRUNCATE ON public.ledger_entries TO bl_public_api_runtime;",
            "NON_CORE_DIRECT_FINANCIAL_WRITE",
        ),
        (
            "D: a privileged routine that resolves names through an unpinned search_path",
            "CREATE FUNCTION public.bz_mut_unpinned() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN PERFORM 1; END $$;
             REVOKE ALL ON FUNCTION public.bz_mut_unpinned() FROM PUBLIC;",
            "UNSAFE_SECURITY_DEFINER_FUNCTIONS",
        ),
        (
            "E: a new table holding money, unclassified",
            "CREATE TABLE public.bz_mut_shadow_balances (id uuid, amount_minor bigint);",
            "UNCLASSIFIED_NEW_FINANCIAL_DB_OBJECTS",
        ),
        (
            "F: an INSTEAD rule that turns a write on a view into a write on wallets",
            "CREATE VIEW public.bz_mut_view AS SELECT id FROM public.wallets;
             CREATE RULE bz_mut_rule AS ON UPDATE TO public.bz_mut_view DO INSTEAD UPDATE public.wallets SET id = NEW.id WHERE id = OLD.id;",
            "NON_CORE_FINANCIAL_WRITE_VIA_VIEW_OR_RULE",
        ),
        (
            "G: a default privilege that gives the gateway writes on future tables",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT ON TABLES TO bl_gateway_runtime;",
            "DATABASE_AUTHORITY_DEFAULT_PRIVILEGES",
        ),
        (
            "H: CREATE on a schema in the search path",
            "GRANT CREATE ON SCHEMA public TO bl_developer_api_runtime;",
            "NON_CORE_SEARCH_PATH_PRIVILEGE_ESCALATION",
        ),
    ];
    for (name, mutation, counter) in cases {
        let err = verify_after(&pool, mutation)
            .await
            .expect_err(&format!("{name}: the verification must fail"));
        assert!(
            err.contains(counter),
            "{name}: expected {counter}, got: {err}"
        );
    }
    // Every mutation was rolled back: the database verifies clean again.
    let mut tx = pool.begin().await.unwrap();
    verify_in(&mut tx).await.expect("clean after the mutations");
    tx.rollback().await.unwrap();
}

/// Mutation A is not theoretical: the definer routine would have let the gateway
/// write a wallet. The gate exists because this works when nothing forbids it.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_definer_routine_would_have_been_a_real_bypass(pool: PgPool) {
    apply_authority(&pool).await;
    let mut tx = pool.begin().await.unwrap();
    sqlx::raw_sql(
        "CREATE FUNCTION public.bz_mut_writer() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.wallets SET id = id WHERE false $$;
         GRANT EXECUTE ON FUNCTION public.bz_mut_writer() TO bl_gateway_runtime;
         SET LOCAL application_name = 'api-gateway';
         SET LOCAL ROLE bl_gateway_runtime;",
    )
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query("SELECT public.bz_mut_writer()")
        .execute(&mut *tx)
        .await
        .expect("a definer routine writes with its owner's authority");
    tx.rollback().await.unwrap();
}

/// Runs `stmt` with `role` as the SESSION user (as a real login would be), so
/// SET ROLE and GRANT are judged by the role's own memberships, not the test's.
async fn as_session(pool: &PgPool, role: &str, stmt: &str) -> Result<(), (String, String)> {
    let mut tx = pool.begin().await.unwrap();
    tx.execute("SET LOCAL application_name = 'banzami-core'")
        .await
        .unwrap();
    tx.execute(format!("SET LOCAL SESSION AUTHORIZATION {role}").as_str())
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

/// On the clean database each indirect attempt is refused by PostgreSQL itself.
#[sqlx::test(migrations = "../../db/migrations")]
async fn a_non_core_role_has_no_indirect_path(pool: PgPool) {
    apply_authority(&pool).await;
    let owner: String = sqlx::query_scalar("SELECT session_user::text")
        .fetch_one(&pool)
        .await
        .unwrap();
    let set_owner = format!("SET ROLE \"{owner}\"");
    let attempts: Vec<(&str, &str)> = vec![
        ("SET ROLE to Core", "SET ROLE bl_core_runtime"),
        ("SET ROLE to the database owner / superuser", set_owner.as_str()),
        ("grant itself Core", "GRANT bl_core_runtime TO bl_gateway_runtime"),
        ("TRUNCATE a financial table", "TRUNCATE public.ledger_entries"),
        ("MERGE into a financial table", "MERGE INTO public.wallets w USING (SELECT NULL::uuid AS id WHERE false) s ON w.id = s.id WHEN MATCHED THEN UPDATE SET id = w.id"),
        ("call a routine that writes a financial table", "SELECT public.create_primary_wallet_account()"),
        ("write through a view", "UPDATE public.business_public_identities SET handle = handle WHERE false"),
        ("create an object in public", "CREATE TABLE public.bz_probe (id int)"),
        ("create a session-local object", "CREATE TEMP TABLE bz_probe (id int)"),
        ("create a schema", "CREATE SCHEMA bz_probe"),
    ];
    for role in NON_CORE {
        for (name, stmt) in &attempts {
            let r = as_session(&pool, role, stmt).await;
            let (code, message) = r.expect_err(&format!("{role}: {name} must be refused"));
            // The one view is not updatable at all (55000) and the role holds no
            // write privilege on it either; everything else is a privilege refusal.
            let allowed: &[&str] = if name.contains("view") {
                &["42501", "55000"]
            } else {
                &["42501"]
            };
            assert!(
                allowed.contains(&code.as_str()),
                "{role}: {name}: refused by PostgreSQL, got {code} {message}"
            );
        }
    }
}
