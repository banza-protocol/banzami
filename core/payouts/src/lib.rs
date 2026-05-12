use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{LedgerPostingId, MerchantId, Money, PayoutId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PayoutStatus {
    Pending,
    Processing,
    Sent,
    Confirmed,
    Failed,
    Returned,
}

/// Destination bank account for a payout.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BankDestination {
    pub account_number: String,
    pub bank_code: String,
    pub account_holder_name: String,
}

/// An outbound disbursement to a merchant's bank account.
///
/// Payouts are idempotent: re-submitting the same `idempotency_key` returns
/// the existing payout rather than creating a duplicate transfer.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Payout {
    pub id: PayoutId,
    pub merchant_id: MerchantId,
    pub idempotency_key: String,
    pub status: PayoutStatus,
    pub amount: Money,
    pub destination: BankDestination,
    pub ledger_posting_id: Option<LedgerPostingId>,
    pub created_at: DateTime<Utc>,
    pub sent_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Error)]
pub enum PayoutError {
    #[error("payout not found: {0}")]
    NotFound(PayoutId),

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("insufficient merchant balance: available {available}, requested {requested}")]
    InsufficientBalance { available: Money, requested: Money },

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition { from: PayoutStatus, to: PayoutStatus },

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
