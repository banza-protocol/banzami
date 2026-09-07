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

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
            (Self::Pending, Self::Processing)
                | (Self::Pending, Self::Failed)
                | (Self::Processing, Self::Sent)
                | (Self::Processing, Self::Failed)
                | (Self::Sent, Self::Confirmed)
                | (Self::Sent, Self::Failed)
                | (Self::Sent, Self::Returned)
        )
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Processing => "PROCESSING",
            Self::Sent => "SENT",
            Self::Confirmed => "CONFIRMED",
            Self::Failed => "FAILED",
            Self::Returned => "RETURNED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING" => Some(Self::Pending),
            "PROCESSING" => Some(Self::Processing),
            "SENT" => Some(Self::Sent),
            "CONFIRMED" => Some(Self::Confirmed),
            "FAILED" => Some(Self::Failed),
            "RETURNED" => Some(Self::Returned),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

/// Destination bank account for a payout — stored denormalised on the payout record.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BankDestination {
    pub account_number: String,
    pub bank_code: String,
    pub account_holder_name: String,
}

/// An outbound disbursement from a merchant wallet to an external bank account.
///
/// Idempotent: re-submitting the same `idempotency_key` returns the existing
/// payout record rather than creating a duplicate transfer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Payout {
    pub id: PayoutId,
    pub merchant_id: MerchantId,
    pub wallet_id: WalletId,
    pub idempotency_key: String,
    pub status: PayoutStatus,
    pub amount: Money,
    pub destination: BankDestination,
    /// Set when the accounting entry is posted at process time.
    pub ledger_posting_id: Option<LedgerPostingId>,
    pub failure_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub sent_at: Option<DateTime<Utc>>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub returned_at: Option<DateTime<Utc>>,
    pub failed_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreatePayoutRequest {
    pub idempotency_key: String,
    pub merchant_id: MerchantId,
    pub wallet_id: WalletId,
    pub amount: Money,
    pub destination: BankDestination,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/// What the pricing engine decided about one withdrawal, in a shape that can be
/// stored beside the payout.
///
/// A completed payout must be able to answer "what rule, what version, what
/// rate, what fee" from its own row. Before this it could answer none of them.
#[derive(Debug, Clone)]
pub struct WithdrawalPricing {
    pub fee_minor: i64,
    pub rule_id: Option<banzami_types::PricingRuleId>,
    pub rule_version: Option<i32>,
    pub rate_bps: Option<u32>,
    pub decided_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Error)]
pub enum PayoutError {
    /// No pricing rule applies to this withdrawal.
    ///
    /// NOT yet raised. The refusal lands only after the completeness gate proves
    /// on the deployed Sandbox that every eligible payout has exactly one
    /// explicit rule — refusing first would turn a revenue leak into a
    /// customer-facing outage, and this path has already produced the leak once
    /// (REPAIR_LOG RA-063: one 80 000 withdrawal, 73 seconds before the rule
    /// existed).
    #[error("no pricing rule applies to this withdrawal")]
    PricingNotConfigured,

    /// More than one rule applies. A financial tie is a configuration error,
    /// never something to settle by comparing identifiers.
    #[error(
        "{candidates} pricing rules apply to this withdrawal — the configuration is ambiguous"
    )]
    PricingAmbiguous { candidates: usize },

    #[error("payout not found: {0}")]
    NotFound(PayoutId),

    /// The named wallet is not owned by the merchant requesting the payout.
    ///
    /// RA-056. The request names a wallet; naming a wallet is not authority over
    /// it. Enforced at the financial boundary rather than only at the API edge,
    /// so no future caller can reach the ledger without proving ownership.
    #[error("wallet {wallet_id} is not owned by merchant {merchant_id}")]
    WalletNotOwned {
        wallet_id: WalletId,
        merchant_id: MerchantId,
    },

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientBalance { available: Money, requested: Money },

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: PayoutStatus,
        to: PayoutStatus,
    },

    #[error("unknown payout status: {0}")]
    UnknownStatus(String),

    #[error("wallet error: {0}")]
    Wallet(String),

    #[error("amount must be positive")]
    InvalidAmount,

    #[error("pricing error: {0}")]
    Pricing(String),

    #[error("resolved fee {fee} exceeds gross {gross}")]
    FeeExceedsGross { fee: i64, gross: i64 },

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
