use chrono::{DateTime, Utc};
use banzami_types::{ConsumerId, Currency, Money, TransferId};

/// Lifecycle of an instant P2P transfer.
///
/// Transfers are designed to be instant — the state machine is simple because
/// the execution is atomic: a transfer either succeeds (COMPLETED) immediately
/// or fails without any partial state.
///
/// ```text
///            ┌──────────┐
///  send()    │          │  ledger post ok   ┌───────────┐
/// ──────────►│ PENDING  ├──────────────────►│ COMPLETED │
///            │          │                   └───────────┘
///            └────┬─────┘
///                 │ insufficient funds /
///                 │ wallet inactive /
///                 │ DB error
///                 ▼
///           ┌──────────┐
///           │  FAILED  │
///           └──────────┘
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransferStatus {
    Pending,
    Completed,
    Failed,
    Reversed,
}

impl TransferStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            TransferStatus::Pending   => "PENDING",
            TransferStatus::Completed => "COMPLETED",
            TransferStatus::Failed    => "FAILED",
            TransferStatus::Reversed  => "REVERSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING"   => Some(TransferStatus::Pending),
            "COMPLETED" => Some(TransferStatus::Completed),
            "FAILED"    => Some(TransferStatus::Failed),
            "REVERSED"  => Some(TransferStatus::Reversed),
            _           => None,
        }
    }
}

/// An immutable record of an attempted or completed P2P transfer.
///
/// # Double-entry invariant
///
/// Every COMPLETED transfer corresponds to exactly one `LedgerPosting` with two entries:
/// ```text
/// DR sender_consumer_wallet:available_account   (LIABILITY ↓ we owe sender less)
/// CR recipient_consumer_wallet:available_account (LIABILITY ↑ we owe recipient more)
/// ```
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Transfer {
    pub id:               TransferId,
    pub idempotency_key:  String,
    pub sender_id:        ConsumerId,
    pub recipient_id:     ConsumerId,
    pub amount:           Money,
    pub currency:         Currency,
    pub status:           TransferStatus,
    pub description:      Option<String>,
    pub failure_reason:   Option<String>,
    /// Ledger posting that backs this transfer — set when status = COMPLETED.
    pub ledger_posting_id: Option<banzami_types::LedgerPostingId>,
    /// Normalized @banza handle used to route the transfer. Snapshotted at send time
    /// for audit trail. None for transfers routed via UUID (internal/merchant flows).
    pub recipient_handle: Option<String>,
    pub created_at:       DateTime<Utc>,
    pub updated_at:       DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Initiate and atomically execute an instant P2P transfer.
pub struct SendTransferRequest {
    pub idempotency_key:  String,
    pub sender_id:        ConsumerId,
    pub recipient_id:     ConsumerId,
    pub amount_minor:     i64,
    pub currency:         Currency,
    pub description:      Option<String>,
    /// Normalized @banza handle of the recipient (no @). Snapshotted for audit trail.
    /// None for internal/merchant flows that route by UUID.
    pub recipient_handle: Option<String>,
}
