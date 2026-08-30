use chrono::{DateTime, Utc};

use banzami_types::{AccountId, LedgerEntryId, LedgerPostingId, Money};

/// Direction of a ledger entry under double-entry accounting.
///
/// Whether a Debit or Credit *increases* or *decreases* a balance depends on
/// the account's [`AccountType`] — use `AccountType::normal_balance_is_debit()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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

    pub const fn as_str(self) -> &'static str {
        match self {
            EntryType::Debit => "DEBIT",
            EntryType::Credit => "CREDIT",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "DEBIT" => Some(EntryType::Debit),
            "CREDIT" => Some(EntryType::Credit),
            _ => None,
        }
    }
}

/// A single debit or credit line within a [`LedgerPosting`].
///
/// # Invariants
/// - `amount` is always positive. Direction is encoded in `entry_type`.
/// - `amount.currency` must match the currency of the target `Account`.
/// - Entries are immutable after posting — corrections happen via reversal postings.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
    ///
    /// `i64::MIN` has no positive counterpart, so negating it is not
    /// representable. Plain `-x` therefore panics under the workspace's release
    /// `overflow-checks` (and wrapped silently before they were enabled, which
    /// is worse: it yields a WRONG signed value in a balance sum). Saturating
    /// keeps this total and keeps the magnitude enormous, so a summation can
    /// never be nudged towards a false zero by it.
    ///
    /// Correctness-critical callers must use [`Self::checked_signed_minor_units`]
    /// instead and treat `None` as "not a valid posting" — that is what the
    /// double-entry invariant does.
    pub fn signed_minor_units(&self) -> i64 {
        match self.entry_type {
            EntryType::Debit => self.amount.amount_minor(),
            EntryType::Credit => self.amount.amount_minor().saturating_neg(),
        }
    }

    /// Exact signed amount, or `None` when the value cannot be represented
    /// (a credit of `i64::MIN`). Used by the double-entry balance invariant, for
    /// which an unrepresentable entry must mean rejection, never an approximation.
    pub fn checked_signed_minor_units(&self) -> Option<i64> {
        match self.entry_type {
            EntryType::Debit => Some(self.amount.amount_minor()),
            EntryType::Credit => self.amount.amount_minor().checked_neg(),
        }
    }
}
