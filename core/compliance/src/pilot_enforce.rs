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
//!     merchant daily-received cap, merchant balance-after cap;
//!   - payment posting: aggregate transaction-volume cap.

use sqlx::PgPool;

use crate::pilot::{PilotLimitPolicy, PilotViolation};

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

/// Value credited to an account since the start of today (UTC).
async fn account_daily_credit_minor(
    pool: &PgPool,
    account_id: uuid::Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM ledger_entries \
          WHERE account_id = $1 AND entry_type = 'CREDIT' \
            AND created_at >= date_trunc('day', now())",
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

/// Cumulative synthetic transaction volume: total value received into merchant
/// available accounts (payments received).
async fn aggregate_volume_minor(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(le.amount_minor), 0)::bigint FROM ledger_entries le \
          WHERE le.entry_type = 'CREDIT' \
            AND le.account_id IN (SELECT available_account_id FROM wallets)",
    )
    .fetch_one(pool)
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

/// Merchant receipt on a payment: enforce merchant per-received, daily-received and
/// balance-after caps for a receipt of `amount_minor` into the merchant's
/// `available_account_id`. Returns the first violation, or `None` if allowed.
pub async fn check_merchant_receipt(
    pool: &PgPool,
    merchant_available_account_id: uuid::Uuid,
    amount_minor: i64,
    policy: PilotLimitPolicy,
) -> Result<Option<PilotViolation>, sqlx::Error> {
    if !policy.is_enabled() {
        return Ok(None);
    }
    let daily = account_daily_credit_minor(pool, merchant_available_account_id).await?;
    if let Some(v) = policy.check_merchant_receipt(amount_minor, daily) {
        return Ok(Some(v));
    }
    let bal = account_balance_minor(pool, merchant_available_account_id).await?;
    Ok(policy.check_merchant_balance_after_credit(bal, amount_minor))
}

/// Payment posting: enforce the aggregate transaction-volume cap for a payment of
/// `amount_minor`. Returns the violation, or `None` if allowed.
pub async fn check_volume(
    pool: &PgPool,
    amount_minor: i64,
    policy: PilotLimitPolicy,
) -> Result<Option<PilotViolation>, sqlx::Error> {
    if !policy.is_enabled() {
        return Ok(None);
    }
    let vol = aggregate_volume_minor(pool).await?;
    Ok(policy.check_aggregate_volume_after_add(vol, amount_minor))
}

/// Convenience: the deterministic code string for a violation (for API surfacing).
pub fn code_str(v: PilotViolation) -> &'static str {
    v.as_str()
}
