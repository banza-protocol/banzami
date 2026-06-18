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
        match check_ledger_invariants(&pool).await {
            Ok(outcome) if outcome.is_healthy() => {
                tracing::debug!("balance_checker: all invariants satisfied");
            }
            // Violations are already logged as structured errors inside the checks.
            Ok(_) => {}
            Err(e) => {
                tracing::error!(error = %e, "balance_checker: check query failed");
            }
        }
    }
}

/// Outcome of one full pass of the ledger invariant checks.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct LedgerCheckOutcome {
    pub unbalanced_postings: u64,
    pub negative_wallets: u64,
    pub orphaned_transfers: u64,
}

impl LedgerCheckOutcome {
    /// True when every ledger invariant holds.
    pub fn is_healthy(&self) -> bool {
        self.unbalanced_postings == 0 && self.negative_wallets == 0 && self.orphaned_transfers == 0
    }
}

/// Run all ledger invariant checks once against the live database.
///
/// Each violation is logged as a structured `LEDGER INVARIANT VIOLATION` error
/// (the stable signal ops alerting matches on) and counted in the returned
/// [`LedgerCheckOutcome`]. Returns `Err` only when a check query itself fails.
/// This is the single entry point used by both the background loop and tests.
pub async fn check_ledger_invariants(pool: &PgPool) -> Result<LedgerCheckOutcome, sqlx::Error> {
    Ok(LedgerCheckOutcome {
        unbalanced_postings: check_posting_balance(pool).await?,
        negative_wallets: check_no_negative_consumer_balances(pool).await?,
        orphaned_transfers: check_completed_transfers_have_postings(pool).await?,
    })
}

// ---------------------------------------------------------------------------
// Check 1: every posting must be balanced (debits == credits)
// ---------------------------------------------------------------------------

async fn check_posting_balance(pool: &PgPool) -> Result<u64, sqlx::Error> {
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

    for (id, net) in &unbalanced {
        tracing::error!(
            posting_id = %id,
            net_minor  = net,
            "LEDGER INVARIANT VIOLATION: posting is not balanced"
        );
    }
    Ok(unbalanced.len() as u64)
}

// ---------------------------------------------------------------------------
// Check 2: no consumer wallet may have a negative available balance
// ---------------------------------------------------------------------------

async fn check_no_negative_consumer_balances(pool: &PgPool) -> Result<u64, sqlx::Error> {
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

    for (wallet_id, consumer_id, balance) in &negatives {
        tracing::error!(
            wallet_id   = %wallet_id,
            consumer_id = %consumer_id,
            balance     = balance,
            "LEDGER INVARIANT VIOLATION: consumer wallet has negative available balance"
        );
    }
    Ok(negatives.len() as u64)
}

// ---------------------------------------------------------------------------
// Check 3: every COMPLETED transfer must reference a ledger posting
// ---------------------------------------------------------------------------

async fn check_completed_transfers_have_postings(pool: &PgPool) -> Result<u64, sqlx::Error> {
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
    }
    Ok(orphaned.max(0) as u64)
}
