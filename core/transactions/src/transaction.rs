use chrono::{DateTime, Utc};

use banzami_types::{Currency, MerchantId, Money, TransactionId, WalletId};

/// Classification of a transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionType {
    Payment,
    Refund,
    Reversal,
    Payout,
}

impl TransactionType {
    pub const fn as_str(self) -> &'static str {
        match self {
            TransactionType::Payment  => "PAYMENT",
            TransactionType::Refund   => "REFUND",
            TransactionType::Reversal => "REVERSAL",
            TransactionType::Payout   => "PAYOUT",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PAYMENT"  => Some(TransactionType::Payment),
            "REFUND"   => Some(TransactionType::Refund),
            "REVERSAL" => Some(TransactionType::Reversal),
            "PAYOUT"   => Some(TransactionType::Payout),
            _ => None,
        }
    }
}

/// Lifecycle state of a transaction.
///
/// # Valid transitions
///
/// ```text
///   PENDING ──► AUTHORIZED ──► CAPTURED
///      │              │
///      ▼              ▼
///   FAILED        REVERSED
///
///   CAPTURED ──► REFUNDED
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransactionStatus {
    /// Created, awaiting acquirer authorization.
    Pending,
    /// Acquirer approved; funds reserved in merchant wallet.
    Authorized,
    /// Funds settled to merchant available balance.
    Captured,
    /// Authorization or capture rejected by acquirer or risk engine.
    Failed,
    /// Authorized transaction voided before capture; reservation released.
    Reversed,
    /// Captured transaction refunded; funds returned to customer.
    Refunded,
}

impl TransactionStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            TransactionStatus::Pending    => "PENDING",
            TransactionStatus::Authorized => "AUTHORIZED",
            TransactionStatus::Captured   => "CAPTURED",
            TransactionStatus::Failed     => "FAILED",
            TransactionStatus::Reversed   => "REVERSED",
            TransactionStatus::Refunded   => "REFUNDED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING"    => Some(TransactionStatus::Pending),
            "AUTHORIZED" => Some(TransactionStatus::Authorized),
            "CAPTURED"   => Some(TransactionStatus::Captured),
            "FAILED"     => Some(TransactionStatus::Failed),
            "REVERSED"   => Some(TransactionStatus::Reversed),
            "REFUNDED"   => Some(TransactionStatus::Refunded),
            _ => None,
        }
    }

    /// Returns true if the transition `self → next` is valid.
    ///
    /// The state machine is intentionally strict — any transition not listed here
    /// is rejected with `TransactionError::InvalidStatusTransition`.
    pub const fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (TransactionStatus::Pending,    TransactionStatus::Authorized) |
            (TransactionStatus::Pending,    TransactionStatus::Failed)     |
            (TransactionStatus::Authorized, TransactionStatus::Captured)   |
            (TransactionStatus::Authorized, TransactionStatus::Reversed)   |
            (TransactionStatus::Authorized, TransactionStatus::Failed)     |
            (TransactionStatus::Captured,   TransactionStatus::Refunded)
        )
    }
}

/// An immutable financial event record.
///
/// `status` and `updated_at` are the only mutable fields; all other fields are
/// set at creation and never changed. Status changes are recorded by writing a
/// new ledger posting and updating these two fields atomically in a DB transaction.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Transaction {
    pub id: TransactionId,
    /// Caller-supplied key for exactly-once creation. (CLAUDE.md §8.3)
    pub idempotency_key: String,
    pub transaction_type: TransactionType,
    pub status: TransactionStatus,
    /// Gross transaction amount before fees — always positive.
    pub amount: Money,
    /// Platform fee retained — zero until the fee engine is wired.
    pub fee: Money,
    pub currency: Currency,
    pub merchant_id: MerchantId,
    /// The merchant wallet receiving (or releasing) funds for this transaction.
    pub wallet_id: WalletId,
    pub description: Option<String>,
    /// Set when status transitions to FAILED; human-readable for the merchant.
    pub failure_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateTransactionRequest {
    pub idempotency_key: String,
    pub transaction_type: TransactionType,
    pub amount: Money,
    pub merchant_id: MerchantId,
    pub wallet_id: WalletId,
    pub description: Option<String>,
}

pub struct AuthorizeRequest {
    pub tx_id: TransactionId,
}

pub struct CaptureRequest {
    pub tx_id: TransactionId,
}

pub struct ReverseRequest {
    pub tx_id: TransactionId,
}

pub struct FailRequest {
    pub tx_id: TransactionId,
    pub reason: String,
}
