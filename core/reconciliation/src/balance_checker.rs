/// Periodic ledger balance consistency checker.
///
/// Runs three invariant checks against the live database on every tick:
///
///  1. **Posting balance** — every ledger posting must have debits == credits
///     (double-entry invariant). Unbalanced postings indicate a ledger bug.
///
///  2. **No negative consumer balances** — no consumer wallet may have a
///     negative available balance. A negative balance means a consumer spent
///     money they don't have, which must never happen.
///
///  3. **Transfer-posting linkage** — every COMPLETED transfer must reference
///     a ledger posting. A completed transfer with no posting is orphaned.
///
/// All failures are logged as errors and counted. The checker never panics or
/// kills the process — it is observability only.
///
/// Run with: `tokio::spawn(run_balance_checker(pool, interval))`
use std::time::Duration;

use sqlx::PgPool;
use tokio::time::{interval, MissedTickBehavior};

pub async fn run_balance_checker(pool: PgPool, tick_interval: Duration) {
    let mut ticker = interval(tick_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ticker.tick().await; // skip the immediate tick at t=0

    loop {
        ticker.tick().await;

        let mut all_ok = true;

        if let Err(e) = check_posting_balance(&pool).await {
            tracing::error!(error = %e, "balance_checker: posting balance check failed");
            all_ok = false;
        }

        if let Err(e) = check_no_negative_consumer_balances(&pool).await {
            tracing::error!(error = %e, "balance_checker: negative balance check failed");
            all_ok = false;
        }

        if let Err(e) = check_completed_transfers_have_postings(&pool).await {
            tracing::error!(error = %e, "balance_checker: transfer-posting linkage check failed");
            all_ok = false;
        }

        if all_ok {
            tracing::debug!("balance_checker: all invariants satisfied");
        }
    }
}

// ---------------------------------------------------------------------------
// Check 1: every posting must be balanced (debits == credits)
// ---------------------------------------------------------------------------

async fn check_posting_balance(pool: &PgPool) -> Result<(), sqlx::Error> {
    let unbalanced: Vec<(uuid::Uuid, i64)> = sqlx::query_as(
        r#"
        SELECT p.id, SUM(
            CASE e.entry_type
                WHEN 'DEBIT'  THEN  e.amount_minor
                WHEN 'CREDIT' THEN -e.amount_minor
                ELSE 0
            END
        )::bigint AS net
        FROM ledger_postings p
        JOIN ledger_entries e ON e.posting_id = p.id
        GROUP BY p.id
        HAVING SUM(
            CASE e.entry_type
                WHEN 'DEBIT'  THEN  e.amount_minor
                WHEN 'CREDIT' THEN -e.amount_minor
                ELSE 0
            END
        ) <> 0
        "#,
    )
    .fetch_all(pool)
    .await?;

    if !unbalanced.is_empty() {
        for (id, net) in &unbalanced {
            tracing::error!(
                posting_id = %id,
                net_minor  = net,
                "LEDGER INVARIANT VIOLATION: posting is not balanced"
            );
        }
        // Return an error so the caller knows this tick found a problem.
        return Err(sqlx::Error::RowNotFound); // sentinel — caller logs it
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Check 2: no consumer wallet may have a negative available balance
// ---------------------------------------------------------------------------

async fn check_no_negative_consumer_balances(pool: &PgPool) -> Result<(), sqlx::Error> {
    // LIABILITY accounts: CREDIT entries increase balance, DEBIT entries decrease it.
    let negatives: Vec<(uuid::Uuid, uuid::Uuid, i64)> = sqlx::query_as(
        r#"
        SELECT
            cw.id              AS wallet_id,
            cw.consumer_id,
            COALESCE(SUM(
                CASE le.entry_type
                    WHEN 'CREDIT' THEN  le.amount_minor
                    WHEN 'DEBIT'  THEN -le.amount_minor
                    ELSE 0
                END
            )::bigint, 0) AS balance
        FROM consumer_wallets cw
        LEFT JOIN ledger_entries le ON le.account_id = cw.available_account_id
        WHERE cw.status = 'ACTIVE'
        GROUP BY cw.id, cw.consumer_id
        HAVING COALESCE(SUM(
            CASE le.entry_type
                WHEN 'CREDIT' THEN  le.amount_minor
                WHEN 'DEBIT'  THEN -le.amount_minor
                ELSE 0
            END
        ), 0) < 0
        "#,
    )
    .fetch_all(pool)
    .await?;

    if !negatives.is_empty() {
        for (wallet_id, consumer_id, balance) in &negatives {
            tracing::error!(
                wallet_id   = %wallet_id,
                consumer_id = %consumer_id,
                balance     = balance,
                "LEDGER INVARIANT VIOLATION: consumer wallet has negative available balance"
            );
        }
        return Err(sqlx::Error::RowNotFound);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Check 3: every COMPLETED transfer must reference a ledger posting
// ---------------------------------------------------------------------------

async fn check_completed_transfers_have_postings(pool: &PgPool) -> Result<(), sqlx::Error> {
    let orphaned: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM transfers
        WHERE status = 'COMPLETED'
          AND ledger_posting_id IS NULL
        "#,
    )
    .fetch_one(pool)
    .await?;

    if orphaned > 0 {
        tracing::error!(
            count = orphaned,
            "LEDGER INVARIANT VIOLATION: COMPLETED transfers with no ledger posting"
        );
        return Err(sqlx::Error::RowNotFound);
    }

    Ok(())
}
