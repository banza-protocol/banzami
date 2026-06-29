use banzami_types::{AccountId, Currency, MerchantId, Money, WalletId};
use chrono::{DateTime, Utc};

/// Lifecycle state of a wallet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WalletStatus {
    Active,
    Suspended,
    Closed,
}

impl WalletStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            WalletStatus::Active => "ACTIVE",
            WalletStatus::Suspended => "SUSPENDED",
            WalletStatus::Closed => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE" => Some(WalletStatus::Active),
            "SUSPENDED" => Some(WalletStatus::Suspended),
            "CLOSED" => Some(WalletStatus::Closed),
            _ => None,
        }
    }
}

/// A merchant's money container, backed by two LIABILITY ledger accounts.
///
/// # Balances are never stored here
///
/// All monetary state is derived from ledger entries via [`WalletEngine::balance`].
/// Storing a balance field on this struct is explicitly forbidden by CLAUDE.md §2.1
/// ("never mutate balances directly").
///
/// # Two-account model
///
/// | Account              | Purpose                                          |
/// |----------------------|--------------------------------------------------|
/// | `available_account`  | Settled funds the merchant can withdraw          |
/// | `reserved_account`   | Funds held for in-flight transaction confirmations |
///
/// Both accounts are `LIABILITY` type — from Banzami's perspective, merchant funds
/// are obligations the platform owes. A credit to a LIABILITY account increases the
/// obligation (we owe more); a debit decreases it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Wallet {
    pub id: WalletId,
    pub merchant_id: MerchantId,
    pub currency: Currency,
    pub status: WalletStatus,
    /// Ledger account for fully settled, withdrawable funds. Type: LIABILITY.
    pub available_account_id: AccountId,
    /// Ledger account for funds reserved pending acquirer confirmation. Type: LIABILITY.
    pub reserved_account_id: AccountId,
    pub created_at: DateTime<Utc>,
}

/// Point-in-time balance derived from ledger entries — never persisted.
///
/// Always recomputed on demand; the wallet table stores no balance columns.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WalletBalance {
    pub wallet_id: WalletId,
    pub currency: Currency,
    /// Settled funds available for payout.
    pub available: Money,
    /// Funds reserved for in-flight transactions; not yet withdrawable.
    pub reserved: Money,
    /// `available + reserved` — total obligation on this wallet.
    pub total: Money,
    pub computed_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateWalletRequest {
    pub merchant_id: MerchantId,
    pub currency: Currency,
}

/// Transfer incoming funds into the merchant's reserved account.
///
/// Used when a transaction is initiated. The caller provides the system-level
/// account that represents incoming funds (e.g., an acquiring float or
/// accounts-receivable account) — the wallet engine does not own that account.
///
/// Double-entry:
/// ```text
/// system:transit [ASSET]        DR  amount   ← money arriving from network
/// wallet:reserved [LIABILITY]   CR  amount   ← Banzami owes merchant (reserved)
/// ```
pub struct ReserveRequest {
    pub idempotency_key: String,
    pub wallet_id: WalletId,
    pub amount: Money,
    /// The system ASSET account being debited (e.g., acquiring float).
    pub from_account_id: AccountId,
}

/// Return reserved funds to the system account on payment failure.
///
/// Double-entry:
/// ```text
/// wallet:reserved [LIABILITY]   DR  amount   ← obligation cancelled
/// system:transit [ASSET]        CR  amount   ← money not received
/// ```
pub struct ReleaseRequest {
    pub idempotency_key: String,
    pub wallet_id: WalletId,
    pub amount: Money,
    /// The system ASSET account being credited back.
    pub to_account_id: AccountId,
}

/// Move funds from reserved to available on acquirer confirmation.
///
/// Double-entry (no operator fee):
/// ```text
/// wallet:reserved [LIABILITY]   DR  amount   ← reservation cleared
/// wallet:available [LIABILITY]  CR  amount   ← funds now withdrawable
/// ```
///
/// With an operator fee (Banzami ADR-021 / BANZA ADR-039), the SAME posting
/// splits the credit so the payee receives the NET and the operator-fee account
/// the fee — one balanced posting, atomic and append-only:
/// ```text
/// wallet:reserved      [LIABILITY] DR  amount        ← gross reservation cleared
/// wallet:available     [LIABILITY] CR  amount - fee  ← payee NET, now withdrawable
/// operator_fee_revenue [REVENUE]   CR  fee           ← operator fee recognized
/// ```
pub struct SettleRequest {
    pub idempotency_key: String,
    pub wallet_id: WalletId,
    pub amount: Money,
    /// Operator fee to retain from `amount`. `None` = legacy full-amount settle.
    /// When `Some`, `operator_fee_account_id` MUST be set and `fee <= amount`.
    pub operator_fee: Option<Money>,
    /// The internal REVENUE account the operator fee is credited to. Required
    /// when `operator_fee` is `Some`; never a merchant wallet account.
    pub operator_fee_account_id: Option<AccountId>,
}
