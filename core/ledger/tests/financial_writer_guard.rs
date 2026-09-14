// ADR-061 / migration 0144 — Banzami Core is the only writer of financial state.
//
// Every service connects to the database as the same runtime role. These tests
// take that role's position — not a superuser, not the table owner — and prove
// the database itself refuses a financial write that does not come from Core,
// and accepts the same write when Core makes it.
//
// The second test keeps the guard complete: a table that holds money or
// references the ledger must either carry the guard or be classified here as
// something that is not financial state. A new such table fails until someone
// decides which it is.
//
// Run: DATABASE_URL=postgres://postgres@localhost:5432/<db> cargo test -p banzami-ledger --test financial_writer_guard

use sqlx::{PgPool, Row};

/// Tables with money or ledger columns that are deliberately NOT financial state,
/// and why. Anything else with such a column must be guarded.
const NOT_FINANCIAL_STATE: &[(&str, &str)] = &[
    (
        "transaction_proofs",
        "receipt evidence about a completed movement; its financial facts are immutable (0125)",
    ),
    (
        "disputes",
        "case workflow; any restitution moves money through refunds, which are guarded",
    ),
    (
        "payment_requests",
        "an intent to be paid; nothing moves until a guarded payment exists",
    ),
    (
        "consumer_pay_links",
        "an intent to be paid; nothing moves until a guarded payment exists",
    ),
    (
        "qr_codes",
        "a payment interface; nothing moves until a guarded payment exists",
    ),
    (
        "velocity_counters",
        "risk counters; they limit movements, they are not movements",
    ),
    (
        "sandbox_test_fundings",
        "Sandbox quota and idempotency reservations; Core posts the credit",
    ),
    (
        "acquiring_reconciliation_items",
        "reconciliation evidence: detects a mismatch, never corrects the ledger",
    ),
    (
        "reconciliation_attempts",
        "reconciliation evidence: detects a mismatch, never corrects the ledger",
    ),
];

async fn probe_role(pool: &PgPool) -> String {
    let role = format!("bz_guard_probe_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE ROLE {role} NOLOGIN NOSUPERUSER"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(&format!("GRANT USAGE ON SCHEMA public TO {role}"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(&format!(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}"
    ))
    .execute(pool)
    .await
    .unwrap();
    role
}

async fn drop_role(pool: &PgPool, role: &str) {
    let db: String = sqlx::query_scalar("SELECT current_database()")
        .fetch_one(pool)
        .await
        .unwrap();
    let _ = sqlx::query(&format!("REASSIGN OWNED BY {role} TO CURRENT_USER"))
        .execute(pool)
        .await;
    let _ = sqlx::query(&format!("DROP OWNED BY {role}"))
        .execute(pool)
        .await;
    let _ = sqlx::query(&format!("REVOKE ALL ON DATABASE \"{db}\" FROM {role}"))
        .execute(pool)
        .await;
    let _ = sqlx::query(&format!("DROP ROLE IF EXISTS {role}"))
        .execute(pool)
        .await;
}

/// Runs `sql` as the probe role with the given application_name, in a
/// transaction that is always rolled back. Returns the database error text, if any.
async fn attempt(pool: &PgPool, role: &str, app: &str, sql: &str) -> Option<String> {
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(&format!("SET LOCAL ROLE {role}"))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(&format!("SET LOCAL application_name = '{app}'"))
        .execute(&mut *tx)
        .await
        .unwrap();
    let r = sqlx::query(sql)
        .execute(&mut *tx)
        .await
        .err()
        .map(|e| e.to_string());
    tx.rollback().await.unwrap();
    r
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn a_financial_write_from_outside_core_is_refused(pool: PgPool) {
    let role = probe_role(&pool).await;
    let writes = [
        "INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES (gen_random_uuid(), 'ASSET', 'probe', 'AOA')",
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at) VALUES (gen_random_uuid(), 'probe', 'probe-' || gen_random_uuid(), now())",
        "UPDATE wallets SET status = status",
        "UPDATE wallet_accounts SET status = status",
        "UPDATE payment_sessions SET status = status",
        "DELETE FROM transfers WHERE false",
        "UPDATE payouts SET status = status",
        "UPDATE refunds SET status = status",
        "UPDATE acquiring_payments SET status = status",
    ];
    for sql in writes {
        let refused = attempt(&pool, &role, "api-gateway", sql).await;
        assert!(
            refused
                .as_deref()
                .is_some_and(|e| e.contains("FINANCIAL_WRITE_OUTSIDE_CORE")),
            "a service that is not Core wrote financial state: {sql} → {refused:?}"
        );
    }
    // The same writes from Core pass the guard (an empty UPDATE, a real INSERT).
    for sql in writes {
        let r = attempt(&pool, &role, "banzami-core", sql).await;
        assert!(
            !r.as_deref()
                .is_some_and(|e| e.contains("FINANCIAL_WRITE_OUTSIDE_CORE")),
            "Core was refused: {sql} → {r:?}"
        );
    }
    // A non-financial table is not guarded: the gateway writes its own webhook rows.
    assert!(attempt(
        &pool,
        &role,
        "api-gateway",
        "UPDATE webhook_endpoints SET active = active"
    )
    .await
    .is_none());
    drop_role(&pool, &role).await;
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn every_table_holding_money_is_guarded_or_classified(pool: PgPool) {
    let rows = sqlx::query(
        "SELECT DISTINCT c.table_name,
                EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class k ON k.oid = t.tgrelid
                         WHERE k.relname = c.table_name AND t.tgname = c.table_name || '_core_only_writer') AS guarded
           FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
          WHERE c.table_schema = 'public'
            AND (c.column_name LIKE '%amount_minor%' OR c.column_name IN ('account_id', 'available_account_id', 'posting_id', 'ledger_posting_id'))
          ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let mut unclassified = Vec::new();
    for r in &rows {
        let table: String = r.get("table_name");
        let guarded: bool = r.get("guarded");
        let classified = NOT_FINANCIAL_STATE.iter().any(|(t, _)| *t == table);
        if !guarded && !classified {
            unclassified.push(table.clone());
        }
        assert!(
            !(guarded && classified),
            "{table} is both guarded and classified as not financial state"
        );
    }
    assert!(
        rows.len() > 20,
        "the schema query found {} tables — it is not reading the schema",
        rows.len()
    );
    assert!(
        unclassified.is_empty(),
        "tables that hold money or reference the ledger with no Core-only guard and no classification: {unclassified:?}"
    );
    // The ledger and the wallets themselves are among the guarded.
    for t in [
        "ledger_entries",
        "wallets",
        "wallet_accounts",
        "transfers",
        "payouts",
    ] {
        let row = rows
            .iter()
            .find(|r| r.get::<String, _>("table_name") == t)
            .unwrap_or_else(|| panic!("{t} missing from the schema query"));
        assert!(row.get::<bool, _>("guarded"), "{t} is not guarded");
    }
}
