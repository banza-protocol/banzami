use chrono::{DateTime, Utc};

use banzami_types::{AccountId, LedgerEntryId, LedgerPostingId, Money};

/// Direction of a ledger entry under double-entry accounting.
///
/// Whether a Debit or Credit *increases* or *decreases* a balance depends on
/// the account's [`AccountType`] — use `AccountType::normal_balance_is_debit()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum EntryType {
    Debit,
    Credit,
}

impl EntryType {
    pub const fn opposite(self) -> Self {
        match self {
            EntryType::Debit => EntryType::Credit,
            EntryType::Credit => EntryType::Debit,
        }
    }
}

/// A single debit or credit line within a [`LedgerPosting`].
///
/// # Invariants
/// - `amount` is always positive. Direction is encoded in `entry_type`.
/// - `amount.currency` must match the currency of the target `Account`.
/// - Entries are immutable after posting — corrections happen via reversal postings.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct LedgerEntry {
    pub id: LedgerEntryId,
    pub posting_id: LedgerPostingId,
    pub account_id: AccountId,
    pub entry_type: EntryType,
    /// Always positive — direction is encoded in `entry_type`.
    pub amount: Money,
    pub created_at: DateTime<Utc>,
}

impl LedgerEntry {
    pub(crate) fn new(
        posting_id: LedgerPostingId,
        account_id: AccountId,
        entry_type: EntryType,
        amount: Money,
    ) -> Self {
        debug_assert!(amount.is_positive(), "entry amount must be positive");
        Self {
            id: LedgerEntryId::new(),
            posting_id,
            account_id,
            entry_type,
            amount,
            created_at: Utc::now(),
        }
    }

    /// Signed amount in minor units: positive for debit, negative for credit.
    /// Useful for balance summation queries.
    pub fn signed_minor_units(&self) -> i64 {
        match self.entry_type {
            EntryType::Debit => self.amount.amount_minor(),
            EntryType::Credit => -self.amount.amount_minor(),
        }
    }
}
