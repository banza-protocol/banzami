use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{Money, SettlementId, TransactionId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReconciliationStatus {
    Matched,
    /// Present in internal ledger, absent from external statement.
    MissingExternal,
    /// Present in external statement, absent from internal ledger.
    MissingInternal,
    /// Both present but amounts differ.
    AmountMismatch,
}

/// A single reconciliation comparison between an internal record and an external statement line.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ReconciliationRecord {
    pub transaction_id: Option<TransactionId>,
    pub settlement_id: Option<SettlementId>,
    pub internal_amount: Option<Money>,
    pub external_amount: Option<Money>,
    pub status: ReconciliationStatus,
    pub discrepancy: Option<Money>,
    pub reconciled_at: DateTime<Utc>,
}

/// Summary of a reconciliation run.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ReconciliationReport {
    pub run_id: String,
    pub total_checked: u64,
    pub matched: u64,
    pub discrepancies: Vec<ReconciliationRecord>,
    pub total_discrepancy: Option<Money>,
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum ReconciliationError {
    #[error("external statement parse error: {0}")]
    ParseError(String),

    #[error("reconciliation run already in progress")]
    RunAlreadyInProgress,
}
