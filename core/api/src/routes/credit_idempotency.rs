//! Idempotency for the credits that create synthetic money: the operator's
//! wallet credit, the Sandbox merchant top-up and the Sandbox consumer credit.
//!
//! Each of them minted its ledger idempotency key from a fresh random UUID, so
//! the key could never repeat: an operator's double click, a client retry after
//! a timeout or a replayed request each posted the money again. All three are
//! refused in LIVE, but in the Sandbox a duplicate still moves the pilot funds
//! cap and every balance built on it.
//!
//! A caller that sends `idempotency_key` now gets exactly one credit per key:
//! - the key becomes part of the posting's `idempotency_key`, which is UNIQUE in
//!   `ledger_postings`, so a concurrent duplicate cannot post twice;
//! - the same key with the same account, amount and currency is the same credit
//!   — the original result is returned and nothing is written (no second audit);
//! - the same key with different economics is refused (409), never re-posted.
//!
//! Without a key the old behaviour stays (harnesses and fixtures that fund one
//! run each); every product caller sends one.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};

/// The ledger idempotency key of a credit. `client` is the caller's key.
pub fn ledger_key(prefix: &str, owner: &str, client: Option<&str>) -> ApiResult<String> {
    match client {
        None => Ok(format!("{prefix}-{owner}-{}", Uuid::new_v4())),
        Some(k) => {
            let ok = (8..=128).contains(&k.len())
                && k.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b));
            if !ok {
                return Err(ApiError::bad_request(
                    "idempotency_key must be 8 to 128 characters of A-Z a-z 0-9 . _ : -",
                ));
            }
            Ok(format!("{prefix}-{owner}-k-{k}"))
        }
    }
}

/// The credit already posted under `key`: its CREDIT leg's account, amount and
/// currency.
pub async fn posted(pool: &PgPool, key: &str) -> ApiResult<Option<(Uuid, i64, String)>> {
    sqlx::query_as::<_, (Uuid, i64, String)>(
        "SELECT e.account_id, e.amount_minor, e.currency
           FROM ledger_postings p
           JOIN ledger_entries e ON e.posting_id = p.id AND e.entry_type = 'CREDIT'
          WHERE p.idempotency_key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))
}

/// Same key, same economics: the same credit. Anything else is refused.
pub fn same_credit(
    prev: &(Uuid, i64, String),
    account: Uuid,
    amount_minor: i64,
    currency: &str,
) -> ApiResult<()> {
    if prev.0 == account && prev.1 == amount_minor && prev.2 == currency {
        Ok(())
    } else {
        Err(ApiError::conflict(
            "IDEMPOTENCY_KEY_REUSED",
            "this idempotency_key was already used for a different credit",
        ))
    }
}

/// A concurrent request posted the same key first (UNIQUE on
/// ledger_postings.idempotency_key).
pub fn is_duplicate_key(e: &sqlx::Error) -> bool {
    e.as_database_error().and_then(|d| d.code()).as_deref() == Some("23505")
}

/// Balance of a liability account (credits minus debits) — what the wallet
/// holder is owed.
pub async fn liability_balance(pool: &PgPool, account: Uuid) -> ApiResult<i64> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE entry_type WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0)::BIGINT
           FROM ledger_entries WHERE account_id = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))
}
