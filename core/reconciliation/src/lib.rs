pub mod balance_checker;
pub mod engine;
pub mod repository;

pub use balance_checker::run_balance_checker;
pub use engine::{ReconciliationEngine, SettlementView, StaticReconciliationEngine};
pub use repository::{PostgresReconciliationRepository, ReconciliationRepository};

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{ReconciliationRunId, SettlementId, TransactionId};

// ---------------------------------------------------------------------------
// External statement line — provided by acquirer or bank
// ---------------------------------------------------------------------------

/// A single line from an external bank or acquirer settlement statement.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExternalStatementLine {
    /// Acquirer/bank reference — used for audit trails only.
    pub reference:    String,
    pub amount_minor: i64,
    pub currency:     String,
    pub posted_at:    DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Reconciliation record
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReconciliationStatus {
    /// Amounts match — no action required.
    Matched,
    /// Present in internal ledger, absent from external statement.
    MissingExternal,
    /// Present in external statement, absent from internal ledger.
    MissingInternal,
    /// Both present but amounts differ.
    AmountMismatch,
}

impl ReconciliationStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Matched         => "MATCHED",
            Self::MissingExternal => "MISSING_EXTERNAL",
            Self::MissingInternal => "MISSING_INTERNAL",
            Self::AmountMismatch  => "AMOUNT_MISMATCH",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "MATCHED"          => Some(Self::Matched),
            "MISSING_EXTERNAL" => Some(Self::MissingExternal),
            "MISSING_INTERNAL" => Some(Self::MissingInternal),
            "AMOUNT_MISMATCH"  => Some(Self::AmountMismatch),
            _ => None,
        }
    }
}

/// A single comparison between an internal record and an external statement line.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ReconciliationRecord {
    pub run_id:           ReconciliationRunId,
    pub settlement_id:    Option<SettlementId>,
    pub transaction_id:   Option<TransactionId>,
    pub external_ref:     Option<String>,
    /// Net amount in the internal ledger (minor units).
    pub internal_minor:   Option<i64>,
    /// Amount from the external statement (minor units).
    pub external_minor:   Option<i64>,
    pub currency:         String,
    pub status:           ReconciliationStatus,
    /// Difference: external − internal (signed, minor units). Zero when matched.
    pub discrepancy_minor: i64,
    pub reconciled_at:    DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Reconciliation report — summary of a single run
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ReconciliationReport {
    pub run_id:              ReconciliationRunId,
    pub total_checked:       u64,
    pub matched:             u64,
    pub missing_external:    u64,
    pub missing_internal:    u64,
    pub amount_mismatches:   u64,
    pub records:             Vec<ReconciliationRecord>,
    /// Sum of |discrepancy| across all mismatched records (minor units).
    pub total_discrepancy_minor: i64,
    pub generated_at:        DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ReconciliationError {
    #[error("reconciliation run {0} not found")]
    NotFound(ReconciliationRunId),

    #[error("external statement parse error: {0}")]
    ParseError(String),

    #[error("reconciliation run already in progress")]
    RunAlreadyInProgress,

    #[error("unknown status: {0}")]
    UnknownStatus(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
