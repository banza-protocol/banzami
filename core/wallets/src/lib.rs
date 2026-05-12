use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{AccountId, Currency, Money, WalletId, MerchantId, CustomerId};

/// Owner of a wallet — either a merchant or an end customer.
#[derive(Debug, Clone, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE", tag = "type", content = "id")]
pub enum WalletOwner {
    Merchant(MerchantId),
    Customer(CustomerId),
}

/// A wallet is a named view over a ledger account.
///
/// Balances are NEVER stored on this struct — they are derived from ledger entries.
/// (CLAUDE.md §2.1: never mutate balances directly)
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Wallet {
    pub id: WalletId,
    pub owner: WalletOwner,
    pub currency: Currency,
    /// The backing ledger account. Balance is computed by querying entries against this.
    pub ledger_account_id: AccountId,
    pub created_at: DateTime<Utc>,
}

/// A point-in-time balance snapshot derived from ledger entries.
///
/// Never persisted — always recomputed on demand.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct WalletBalance {
    pub wallet_id: WalletId,
    pub currency: Currency,
    /// Fully settled, unreserved funds available for use.
    pub available: Money,
    /// Funds reserved for pending authorizations or holds.
    pub on_hold: Money,
    /// available + on_hold (total ledger balance).
    pub total: Money,
    pub computed_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum WalletError {
    #[error("wallet not found: {0}")]
    NotFound(WalletId),

    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientFunds { available: Money, requested: Money },

    #[error("currency mismatch: wallet is {wallet_currency}, operation is {operation_currency}")]
    CurrencyMismatch {
        wallet_currency: Currency,
        operation_currency: Currency,
    },

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
