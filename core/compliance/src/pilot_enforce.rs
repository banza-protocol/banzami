//! Runtime enforcement queries for the V1.0 pilot-limit policy (internal Sandbox /
//! Phase 0 only). These async functions read the REAL ledger/wallet state and apply
//! the pure [`crate::pilot`] policy, returning the deterministic violation (if any)
//! BEFORE any ledger posting. They never mutate state.
//!
//! Balance is derived from ledger entries using the canonical sign convention
//! (CREDIT adds, DEBIT subtracts) — the same convention used by the wallet balance
//! route. Runtime string queries are used (no compile-time sqlx cache dependency).
//!
//! Enforcement points (called by the API before posting):
//!   - funding/top-up (value entering a wallet): consumer/merchant balance cap +
//!     aggregate funds-in-circulation cap;
//!   - merchant receipt (payment to a merchant): merchant per-received cap,
//!     merchant balance-after cap, and the four ROLLING merchant-credit volume
//!     windows (owner decision D1).
//!
//! The rolling windows replaced a lifetime cumulative counter. Retirement of
//! synthetic value posts a DEBIT and the counter summed CREDITs only, so it
//! could never fall: the Sandbox had a finite total number of merchant payments
//! for its whole existence. Windows give the measure a steady state, and they
//! read the same immutable ledger the old counter did — the change is in the
//! PREDICATE, never in the data.

use sqlx::PgPool;

use crate::pilot::{PilotLimitPolicy, PilotViolation, RollingVolumeUsage};

/// Which party a funded wallet belongs to (selects the correct balance cap).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Party {
    Consumer,
    Merchant,
}

/// Balance of a ledger account in minor units (CREDIT − DEBIT). Never negative in
/// normal operation, but computed generically.
async fn account_balance_minor(pool: &PgPool, account_id: uuid::Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor \
                                  ELSE -amount_minor END), 0)::bigint \
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await
}

/// Total synthetic funds in circulation: the summed balance of every wallet and
/// consumer-wallet available account.
async fn aggregate_funds_minor(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount_minor \
                                  ELSE -le.amount_minor END), 0)::bigint \
           FROM ledger_entries le \
          WHERE le.account_id IN ( \
                SELECT available_account_id FROM wallets \
                UNION SELECT available_account_id FROM consumer_wallets)",
    )
    .fetch_one(pool)
    .await
}

/// Merchant-credit volume across EVERY merchant inside a rolling window.
///
/// `window` is a Postgres interval literal ('24 hours', '30 days'). Read-only:
/// this counts history, it never writes it.
async fn global_rolling_volume_minor(
    conn: &mut sqlx::PgConnection,
    window: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(le.amount_minor), 0)::bigint FROM ledger_entries le \
          WHERE le.entry_type = 'CREDIT' \
            AND le.created_at >= now() - $1::interval \
            AND le.account_id IN (SELECT available_account_id FROM wallets)",
    )
    .bind(window)
    .fetch_one(&mut *conn)
    .await
}

/// Merchant-credit volume for ONE merchant's available account inside a rolling
/// window. Scoped by account rather than by merchant id so it costs an index
/// lookup on the column the entries already carry.
async fn merchant_rolling_volume_minor(
    conn: &mut sqlx::PgConnection,
    merchant_available_account_id: uuid::Uuid,
    window: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM ledger_entries \
          WHERE entry_type = 'CREDIT' AND account_id = $1 \
            AND created_at >= now() - $2::interval",
    )
    .bind(merchant_available_account_id)
    .bind(window)
    .fetch_one(&mut *conn)
    .await
}

/// All four rolling windows for one merchant, measured in one place.
pub async fn rolling_volume_usage(
    conn: &mut sqlx::PgConnection,
    merchant_available_account_id: uuid::Uuid,
) -> Result<RollingVolumeUsage, sqlx::Error> {
    Ok(RollingVolumeUsage {
        global_24h_minor: global_rolling_volume_minor(&mut *conn, "24 hours").await?,
        global_30d_minor: global_rolling_volume_minor(&mut *conn, "30 days").await?,
        merchant_24h_minor: merchant_rolling_volume_minor(
            &mut *conn,
            merchant_available_account_id,
            "24 hours",
        )
        .await?,
        merchant_30d_minor: merchant_rolling_volume_minor(
            &mut *conn,
            merchant_available_account_id,
            "30 days",
        )
        .await?,
    })
}

/// Balance of a ledger account, read on the caller's own connection.
async fn account_balance_minor_conn(
    conn: &mut sqlx::PgConnection,
    account_id: uuid::Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor \
                                  ELSE -amount_minor END), 0)::bigint \
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account_id)
    .fetch_one(&mut *conn)
    .await
}

/// Funding/top-up: enforce the party balance cap and the aggregate funds cap for a
/// credit of `credit_minor` into `available_account_id`. Returns the first
/// violation, or `None` if allowed (or the policy is disabled).
pub async fn check_funding(
    pool: &PgPool,
    party: Party,
    available_account_id: uuid::Uuid,
    credit_minor: i64,
    policy: PilotLimitPolicy,
) -> Result<Option<PilotViolation>, sqlx::Error> {
    if !policy.is_enabled() {
        return Ok(None);
    }
    let bal = account_balance_minor(pool, available_account_id).await?;
    let balance_violation = match party {
        Party::Consumer => policy.check_consumer_balance_after_credit(bal, credit_minor),
        Party::Merchant => policy.check_merchant_balance_after_credit(bal, credit_minor),
    };
    if let Some(v) = balance_violation {
        return Ok(Some(v));
    }
    let funds = aggregate_funds_minor(pool).await?;
    Ok(policy.check_aggregate_funds_after_add(funds, credit_minor))
}

/// Funding of a Project-owned Sandbox test payer (ADR-060 §6): the per-party
/// balance cap applies, the Sandbox-wide aggregate cap does not. That cap is a
/// resource every developer shares; one Project's test payers could exhaust it
/// for all the others. Their fictitious value is bounded per Project instead,
/// by the test-payer quotas in public-api.
pub async fn check_test_payer_funding(
    pool: &PgPool,
    available_account_id: uuid::Uuid,
    credit_minor: i64,
    policy: PilotLimitPolicy,
) -> Result<Option<PilotViolation>, sqlx::Error> {
    if !policy.is_enabled() {
        return Ok(None);
    }
    let bal = account_balance_minor(pool, available_account_id).await?;
    Ok(policy.check_consumer_balance_after_credit(bal, credit_minor))
}



/// **The merchant-credit gate.** Every path that credits a merchant's available
/// account calls this BEFORE posting, with the amount about to be credited.
///
/// It enforces, in this order: the per-receipt cap, the merchant balance cap, and
/// the four rolling volume windows (merchant 24h → merchant 30d → global 24h →
/// global 30d). The first violation wins, narrowest scope first, so a caller is
/// told the thing it can act on.
///
/// Read-only and pre-posting: it measures immutable history and returns a
/// decision. It never mutates a ledger entry, a posting, a balance or a counter —
/// there is no counter to mutate, because every window is derived by query.
///
/// Fail-closed by construction: an unreadable measurement returns `Err`, and
/// every caller turns that into a refusal rather than a permit.
///
/// Takes a CONNECTION, not a pool, so it runs inside the caller's own
/// transaction — the same transaction that will post the credit. Measuring on a
/// separate pool connection would read a snapshot taken outside the posting's
/// transaction, and two concurrent payments could each see the window open and
/// then both close it.
pub async fn check_merchant_credit(
    conn: &mut sqlx::PgConnection,
    merchant_available_account_id: uuid::Uuid,
    amount_minor: i64,
    policy: PilotLimitPolicy,
) -> Result<Option<PilotViolation>, sqlx::Error> {
    if !policy.is_enabled() {
        return Ok(None);
    }
    if let Some(v) = policy.check_merchant_receipt_amount(amount_minor) {
        return Ok(Some(v));
    }
    let bal = account_balance_minor_conn(&mut *conn, merchant_available_account_id).await?;
    if let Some(v) = policy.check_merchant_balance_after_credit(bal, amount_minor) {
        return Ok(Some(v));
    }
    let usage = rolling_volume_usage(&mut *conn, merchant_available_account_id).await?;
    Ok(policy.check_rolling_volume_after_add(usage, amount_minor))
}

/// Convenience: the deterministic code string for a violation (for API surfacing).
pub fn code_str(v: PilotViolation) -> &'static str {
    v.as_str()
}
