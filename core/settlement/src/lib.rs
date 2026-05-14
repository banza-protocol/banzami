mod engine;
mod repository;
pub mod scheduler;

pub use engine::{CreateSettlementBatchRequest, PostgresSettlementEngine, SettlementEngine};
pub use repository::{PostgresSettlementRepository, SettlementRepository};
pub use scheduler::run_settlement_scheduler;

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{Currency, LedgerPostingId, MerchantId, Money, SettlementId, WalletId};

// ---------------------------------------------------------------------------
// Status — strict state machine
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SettlementStatus {
    /// Batch created; not yet submitted to the acquirer.
    Pending,
    /// Submitted to the acquirer; awaiting confirmation.
    Submitted,
    /// Acquirer confirmed; net funds received and posted to the ledger.
    Settled,
    /// Acquirer rejected or confirmation timed out.
    Failed,
}

impl SettlementStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            SettlementStatus::Pending   => "PENDING",
            SettlementStatus::Submitted => "SUBMITTED",
            SettlementStatus::Settled   => "SETTLED",
            SettlementStatus::Failed    => "FAILED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING"   => Some(SettlementStatus::Pending),
            "SUBMITTED" => Some(SettlementStatus::Submitted),
            "SETTLED"   => Some(SettlementStatus::Settled),
            "FAILED"    => Some(SettlementStatus::Failed),
            _ => None,
        }
    }

    /// Valid transitions:
    /// ```text
    /// PENDING ──► SUBMITTED ──► SETTLED
    ///    │              │
    ///    └──────────────┴──► FAILED
    /// ```
    pub const fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (SettlementStatus::Pending,   SettlementStatus::Submitted) |
            (SettlementStatus::Pending,   SettlementStatus::Failed)    |
            (SettlementStatus::Submitted, SettlementStatus::Settled)   |
            (SettlementStatus::Submitted, SettlementStatus::Failed)
        )
    }
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A net settlement batch for one merchant over a time window.
///
/// When `status = SETTLED`, `ledger_posting_id` is set to the confirmation
/// posting that records the actual cash movement from the acquirer.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Settlement {
    pub id:                 SettlementId,
    pub merchant_id:        MerchantId,
    pub wallet_id:          WalletId,
    pub currency:           Currency,
    pub status:             SettlementStatus,
    /// Sum of captured transaction amounts in the window.
    pub gross_amount:       Money,
    /// Platform fees retained.
    pub fee_amount:         Money,
    /// `gross_amount − fee_amount` — what the merchant actually receives.
    pub net_amount:         Money,
    pub transaction_count:  u32,
    pub period_start:       DateTime<Utc>,
    pub period_end:         DateTime<Utc>,
    /// Set when status transitions to SETTLED.
    pub ledger_posting_id:  Option<LedgerPostingId>,
    pub failure_reason:     Option<String>,
    pub submitted_at:       Option<DateTime<Utc>>,
    pub settled_at:         Option<DateTime<Utc>>,
    pub created_at:         DateTime<Utc>,
    pub updated_at:         DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum SettlementError {
    #[error("settlement {0} not found")]
    NotFound(SettlementId),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition { from: SettlementStatus, to: SettlementStatus },

    #[error("fee {fee} exceeds gross {gross}")]
    FeeExceedsGross { fee: Money, gross: Money },

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
