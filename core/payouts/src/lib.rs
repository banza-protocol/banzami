pub mod engine;
pub mod repository;

pub use engine::{PayoutEngine, PostgresPayoutEngine};
pub use repository::{PayoutRepository, PostgresPayoutRepository};

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{LedgerPostingId, MerchantId, Money, PayoutId, WalletId};

// ---------------------------------------------------------------------------
// Status — strict state machine enforced by can_transition_to
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PayoutStatus {
    /// Created; ledger not yet posted.
    Pending,
    /// Ledger posted (DR available / CR bank); queued for bank submission.
    Processing,
    /// Submitted to bank API; awaiting confirmation.
    Sent,
    /// Bank confirmed receipt — terminal.
    Confirmed,
    /// Permanently failed — terminal. Ledger reversed if was Processing/Sent.
    Failed,
    /// Bank returned funds — terminal. Ledger reversed.
    Returned,
}

impl PayoutStatus {
    pub const fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Pending,    Self::Processing)
            | (Self::Pending,    Self::Failed)
            | (Self::Processing, Self::Sent)
            | (Self::Processing, Self::Failed)
            | (Self::Sent,       Self::Confirmed)
            | (Self::Sent,       Self::Failed)
            | (Self::Sent,       Self::Returned)
        )
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending    => "PENDING",
            Self::Processing => "PROCESSING",
            Self::Sent       => "SENT",
            Self::Confirmed  => "CONFIRMED",
            Self::Failed     => "FAILED",
            Self::Returned   => "RETURNED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING"    => Some(Self::Pending),
            "PROCESSING" => Some(Self::Processing),
            "SENT"       => Some(Self::Sent),
            "CONFIRMED"  => Some(Self::Confirmed),
            "FAILED"     => Some(Self::Failed),
            "RETURNED"   => Some(Self::Returned),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

/// Destination bank account for a payout — stored denormalised on the payout record.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct BankDestination {
    pub account_number:      String,
    pub bank_code:           String,
    pub account_holder_name: String,
}

/// An outbound disbursement from a merchant wallet to an external bank account.
///
/// Idempotent: re-submitting the same `idempotency_key` returns the existing
/// payout record rather than creating a duplicate transfer.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Payout {
    pub id:                PayoutId,
    pub merchant_id:       MerchantId,
    pub wallet_id:         WalletId,
    pub idempotency_key:   String,
    pub status:            PayoutStatus,
    pub amount:            Money,
    pub destination:       BankDestination,
    /// Set when the accounting entry is posted at process time.
    pub ledger_posting_id: Option<LedgerPostingId>,
    pub failure_reason:    Option<String>,
    pub created_at:        DateTime<Utc>,
    pub sent_at:           Option<DateTime<Utc>>,
    pub confirmed_at:      Option<DateTime<Utc>>,
    pub returned_at:       Option<DateTime<Utc>>,
    pub failed_at:         Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreatePayoutRequest {
    pub idempotency_key: String,
    pub merchant_id:     MerchantId,
    pub wallet_id:       WalletId,
    pub amount:          Money,
    pub destination:     BankDestination,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum PayoutError {
    #[error("payout not found: {0}")]
    NotFound(PayoutId),

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientBalance { available: Money, requested: Money },

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition { from: PayoutStatus, to: PayoutStatus },

    #[error("unknown payout status: {0}")]
    UnknownStatus(String),

    #[error("wallet error: {0}")]
    Wallet(String),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
