use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{Currency, LedgerPostingId, MerchantId, Money, TransactionId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionType {
    Payment,
    Refund,
    Reversal,
    Payout,
}

/// State machine for a payment transaction.
///
/// Valid transitions:
///   Pending → Authorized → Captured
///   Pending → Failed
///   Authorized → Reversed
///   Captured → Refunded (partial or full)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionStatus {
    Pending,
    Authorized,
    Captured,
    Failed,
    Reversed,
    Refunded,
}

/// An immutable financial event.
///
/// Once a transaction is created it is never mutated.
/// Status changes generate new ledger postings and update `status` + `updated_at`.
/// All monetary side-effects are recorded in the ledger via `ledger_posting_id`.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Transaction {
    pub id: TransactionId,
    /// Caller-supplied key for exactly-once semantics. (CLAUDE.md §8.3)
    pub idempotency_key: String,
    pub transaction_type: TransactionType,
    pub status: TransactionStatus,
    /// Gross transaction amount before fees.
    pub amount: Money,
    /// Platform fee retained from this transaction.
    pub fee: Money,
    pub currency: Currency,
    pub merchant_id: MerchantId,
    /// Set once the transaction is posted to the ledger.
    pub ledger_posting_id: Option<LedgerPostingId>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("transaction not found: {0}")]
    NotFound(TransactionId),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: TransactionStatus,
        to: TransactionStatus,
    },

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
