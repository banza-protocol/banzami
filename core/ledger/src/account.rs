use chrono::{DateTime, Utc};

use banzami_types::{AccountId, Currency};

/// Classification of a ledger account under double-entry accounting.
///
/// Normal balance (the side that increases the account):
///   Asset    → Debit    |   Liability → Credit
///   Expense  → Debit    |   Equity    → Credit
///                       |   Revenue   → Credit
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AccountType {
    /// Funds owned or owed to us (customer wallet funds, bank float, reserves)
    Asset,
    /// Obligations owed to others (merchant payables, pending settlements)
    Liability,
    /// Owner's stake (retained earnings, capital)
    Equity,
    /// Income earned (transaction fees, FX spread)
    Revenue,
    /// Costs incurred (acquirer fees, bank charges)
    Expense,
}

impl AccountType {
    /// Returns true when a Debit increases this account's balance (Asset, Expense).
    /// Returns false when a Credit increases it (Liability, Equity, Revenue).
    pub const fn normal_balance_is_debit(self) -> bool {
        matches!(self, AccountType::Asset | AccountType::Expense)
    }
}

/// A node in the chart of accounts.
///
/// Accounts are immutable after creation — never change `account_type` or `currency`.
/// All monetary state flows from [`LedgerEntry`] records against this account.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Account {
    pub id: AccountId,
    pub account_type: AccountType,
    /// Human-readable name, e.g. "Customer Wallets — AOA Float"
    pub name: String,
    /// All entries against this account MUST use this currency.
    pub currency: Currency,
    pub created_at: DateTime<Utc>,
}

impl Account {
    pub fn new(account_type: AccountType, name: impl Into<String>, currency: Currency) -> Self {
        Self {
            id: AccountId::new(),
            account_type,
            name: name.into(),
            currency,
            created_at: Utc::now(),
        }
    }
}
