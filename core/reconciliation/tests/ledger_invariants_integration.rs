// Ledger invariant integration tests — "Is the money provably correct?"
//
//   LED-002 (immutability, INV-LED-002-1): the append-only trigger rejects any
//           UPDATE or DELETE on ledger_entries.
//   LED-004 (reconciliation, balance checker): check_ledger_invariants detects
//           an unbalanced posting and passes a balanced ledger.
//
// All against a real PostgreSQL database (no mocks, CLAUDE.md §7).

use banzami_reconciliation::check_ledger_invariants;
use sqlx::PgPool;

/// Create a ledger account (entries reference it by FK).
async fn seed_account(pool: &PgPool) -> uuid::Uuid {
    let id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_accounts (id, account_type, name, currency, created_at)
         VALUES ($1, 'LIABILITY', 'test', 'AOA', now())",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    id
}

/// Insert a ledger posting with the given entries (entry_type, amount_minor).
/// Each entry posts against its own account so the per-posting (posting_id,
/// entry_type) uniqueness constraint is the only one in play.
async fn seed_posting(pool: &PgPool, entries: &[(&str, i64)]) -> uuid::Uuid {
    let posting_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ledger_postings (id, description, idempotency_key, created_at)
         VALUES ($1, 'test', $2, now())",
    )
    .bind(posting_id)
    .bind(format!("idem-{posting_id}"))
    .execute(pool)
    .await
    .unwrap();

    for (entry_type, amount) in entries {
        let account_id = seed_account(pool).await;
        sqlx::query(
            "INSERT INTO ledger_entries
             (id, posting_id, account_id, entry_type, amount_minor, currency, created_at)
             VALUES ($1, $2, $3, $4, $5, 'AOA', now())",
        )
        .bind(uuid::Uuid::new_v4())
        .bind(posting_id)
        .bind(account_id)
        .bind(*entry_type)
        .bind(*amount)
        .execute(pool)
        .await
        .unwrap();
    }
    posting_id
}

// ── LED-004: balance checker ────────────────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn balanced_ledger_passes_invariant_checks(pool: PgPool) {
    // A balanced posting: 1000 DEBIT + 1000 CREDIT → nets to zero.
    seed_posting(&pool, &[("DEBIT", 1000), ("CREDIT", 1000)]).await;

    let outcome = check_ledger_invariants(&pool).await.unwrap();
    assert!(
        outcome.is_healthy(),
        "a balanced ledger must satisfy every invariant: {outcome:?}"
    );
    assert_eq!(outcome.unbalanced_postings, 0);
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn unbalanced_posting_is_detected(pool: PgPool) {
    // A balanced posting plus a broken one (debit with no matching credit).
    seed_posting(&pool, &[("DEBIT", 500), ("CREDIT", 500)]).await;
    seed_posting(&pool, &[("DEBIT", 750)]).await; // unbalanced — nets to 750

    let outcome = check_ledger_invariants(&pool).await.unwrap();
    assert!(
        !outcome.is_healthy(),
        "an unbalanced posting must be flagged"
    );
    assert_eq!(
        outcome.unbalanced_postings, 1,
        "exactly the one broken posting is detected: {outcome:?}"
    );
}

// ── LED-002: immutability (append-only) ─────────────────────────────────────

#[sqlx::test(migrations = "../../db/migrations")]
async fn ledger_entries_cannot_be_updated(pool: PgPool) {
    let posting_id = seed_posting(&pool, &[("DEBIT", 100), ("CREDIT", 100)]).await;

    let result =
        sqlx::query("UPDATE ledger_entries SET amount_minor = 999999 WHERE posting_id = $1")
            .bind(posting_id)
            .execute(&pool)
            .await;

    assert!(
        result.is_err(),
        "UPDATE on ledger_entries must be rejected by the immutability trigger"
    );
}

#[sqlx::test(migrations = "../../db/migrations")]
async fn ledger_entries_cannot_be_deleted(pool: PgPool) {
    let posting_id = seed_posting(&pool, &[("DEBIT", 100), ("CREDIT", 100)]).await;

    let result = sqlx::query("DELETE FROM ledger_entries WHERE posting_id = $1")
        .bind(posting_id)
        .execute(&pool)
        .await;

    assert!(
        result.is_err(),
        "DELETE on ledger_entries must be rejected by the immutability trigger"
    );
}
