use chrono::{DateTime, NaiveDate, Utc};
use thiserror::Error;

use banzami_types::{LedgerPostingId, MerchantId, Money, SettlementId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SettlementStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Reconciled,
}

/// A net settlement batch for a merchant over a settlement window.
///
/// Settlement nets all captured transactions minus fees and refunds for the period,
/// then generates a ledger posting transferring the net amount to the merchant payable account.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Settlement {
    pub id: SettlementId,
    pub merchant_id: MerchantId,
    pub status: SettlementStatus,
    /// Gross volume of captured transactions in the settlement window.
    pub gross_volume: Money,
    /// Total fees deducted.
    pub fees_deducted: Money,
    /// Total refunds deducted.
    pub refunds_deducted: Money,
    /// Net amount due to merchant: gross_volume - fees_deducted - refunds_deducted.
    pub net_amount: Money,
    /// Settlement window boundaries.
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub ledger_posting_id: Option<LedgerPostingId>,
    pub created_at: DateTime<Utc>,
    pub settled_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Error)]
pub enum SettlementError {
    #[error("settlement not found: {0}")]
    NotFound(SettlementId),

    #[error("settlement already completed: {0}")]
    AlreadyCompleted(SettlementId),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
