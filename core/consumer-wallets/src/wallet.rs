use chrono::{DateTime, Utc};
use banzami_types::{AccountId, ConsumerId, ConsumerWalletId, Currency, Money};

/// Lifecycle state of a consumer wallet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConsumerWalletStatus {
    Active,
    Suspended,
    Closed,
}

impl ConsumerWalletStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            ConsumerWalletStatus::Active    => "ACTIVE",
            ConsumerWalletStatus::Suspended => "SUSPENDED",
            ConsumerWalletStatus::Closed    => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE"    => Some(ConsumerWalletStatus::Active),
            "SUSPENDED" => Some(ConsumerWalletStatus::Suspended),
            "CLOSED"    => Some(ConsumerWalletStatus::Closed),
            _           => None,
        }
    }
}

/// A consumer's money container, backed by two LIABILITY ledger accounts.
///
/// # Balance model
///
/// Balances are never stored on this struct — they are always derived from
/// ledger entries (`CLAUDE.md §2.1`). The two accounts give us:
///
/// | Account             | Purpose                                   |
/// |---------------------|-------------------------------------------|
/// | `available_account` | Funds available to send or withdraw       |
/// | `reserved_account`  | Funds reserved pending outbound transfers |
///
/// Both accounts are `LIABILITY` type — Banzami owes these funds to the consumer.
/// A credit to a LIABILITY account increases the obligation (we owe more).
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConsumerWallet {
    pub id:                   ConsumerWalletId,
    pub consumer_id:          ConsumerId,
    pub currency:             Currency,
    pub status:               ConsumerWalletStatus,
    /// Ledger account for immediately spendable funds. Type: LIABILITY.
    pub available_account_id: AccountId,
    /// Ledger account for funds held pending outbound completion. Type: LIABILITY.
    pub reserved_account_id:  AccountId,
    pub created_at:           DateTime<Utc>,
}

/// Point-in-time balance derived from ledger entries — never persisted.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConsumerWalletBalance {
    pub wallet_id:   ConsumerWalletId,
    pub consumer_id: ConsumerId,
    pub currency:    Currency,
    /// Spendable funds.
    pub available:   Money,
    /// Funds reserved for in-flight outbound operations.
    pub reserved:    Money,
    /// `available + reserved`.
    pub total:       Money,
    pub computed_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateConsumerWalletRequest {
    pub consumer_id: ConsumerId,
    pub currency:    Currency,
}
