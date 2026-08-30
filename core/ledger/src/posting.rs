use std::collections::HashMap;

use chrono::{DateTime, Utc};

use banzami_types::{AccountId, Currency, LedgerPostingId, Money};

use crate::{
    entry::{EntryType, LedgerEntry},
    LedgerError,
};

/// A balanced journal entry: the atomic unit of the ledger.
///
/// # Invariants
/// - Contains ≥ 2 entries.
/// - For every currency present: sum(debits) == sum(credits) in minor units.
/// - Entries are immutable — this struct is append-only once posted.
/// - `idempotency_key` is globally unique; re-posting the same key returns the existing posting.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LedgerPosting {
    pub id: LedgerPostingId,
    pub entries: Vec<LedgerEntry>,
    /// Human-readable description for audit and reconciliation.
    pub description: String,
    /// Caller-supplied key that guarantees exactly-once posting. (CLAUDE.md §8.3)
    pub idempotency_key: String,
    pub created_at: DateTime<Utc>,
}

impl LedgerPosting {
    /// Verify the double-entry balance invariant.
    /// Returns Ok(()) if balanced, Err with the first offending currency if not.
    pub fn assert_balanced(&self) -> Result<(), LedgerError> {
        // Checked accumulation. With wrapping i64 arithmetic a set of entries
        // whose REAL total is non-zero can wrap around to a computed total of
        // exactly zero (e.g. three debits of i64::MAX, i64::MAX and 2), so the
        // posting would report itself balanced while creating value from
        // nothing. An overflow here is never a legitimate posting: it is
        // reported as unbalanced rather than silently wrapped.
        let mut sums: HashMap<Currency, i64> = HashMap::new();
        for entry in &self.entries {
            let bucket = sums.entry(entry.amount.currency).or_insert(0);
            let signed = entry
                .checked_signed_minor_units()
                .ok_or_else(|| Self::unbalanced_for(&self.entries, entry.amount.currency))?;
            *bucket = bucket
                .checked_add(signed)
                .ok_or_else(|| Self::unbalanced_for(&self.entries, entry.amount.currency))?;
        }
        for (currency, net) in sums {
            if net != 0 {
                return Err(Self::unbalanced_for(&self.entries, currency));
            }
        }
        Ok(())
    }

    /// Build the UnbalancedPosting error for a currency. Totals are saturating
    /// so that reporting an overflowing posting cannot itself overflow.
    fn unbalanced_for(entries: &[LedgerEntry], currency: Currency) -> LedgerError {
        let total = |kind: EntryType| -> i64 {
            entries
                .iter()
                .filter(|e| e.amount.currency == currency && e.entry_type == kind)
                .fold(0i64, |acc, e| acc.saturating_add(e.amount.amount_minor()))
        };
        LedgerError::UnbalancedPosting {
            debits_minor: total(EntryType::Debit),
            credits_minor: total(EntryType::Credit),
            currency,
        }
    }
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/// Constructs a [`LedgerPosting`] with compile-time-enforced minimum of two entries.
pub struct PostingBuilder {
    id: LedgerPostingId,
    entries: Vec<LedgerEntry>,
    description: String,
    idempotency_key: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PostingError {
    #[error("posting must have at least two entries")]
    InsufficientEntries,

    #[error(transparent)]
    Ledger(#[from] LedgerError),
}

impl PostingBuilder {
    pub fn new(description: impl Into<String>, idempotency_key: impl Into<String>) -> Self {
        Self {
            id: LedgerPostingId::new(),
            entries: Vec::new(),
            description: description.into(),
            idempotency_key: idempotency_key.into(),
        }
    }

    pub fn debit(mut self, account_id: AccountId, amount: Money) -> Self {
        self.entries.push(LedgerEntry::new(
            self.id,
            account_id,
            EntryType::Debit,
            amount,
        ));
        self
    }

    pub fn credit(mut self, account_id: AccountId, amount: Money) -> Self {
        self.entries.push(LedgerEntry::new(
            self.id,
            account_id,
            EntryType::Credit,
            amount,
        ));
        self
    }

    /// Validate and build. Returns Err if there are fewer than 2 entries or the posting is not balanced.
    pub fn build(self) -> Result<LedgerPosting, PostingError> {
        if self.entries.len() < 2 {
            return Err(PostingError::InsufficientEntries);
        }
        let posting = LedgerPosting {
            id: self.id,
            entries: self.entries,
            description: self.description,
            idempotency_key: self.idempotency_key,
            created_at: Utc::now(),
        };
        posting.assert_balanced()?;
        Ok(posting)
    }
}

// ---------------------------------------------------------------------------
// Tests — financial invariant tests (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use banzami_types::{AccountId, Currency, Money};

    fn account() -> AccountId {
        AccountId::new()
    }

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    #[test]
    fn balanced_posting_passes() {
        let src = account();
        let dst = account();
        let posting = PostingBuilder::new("test payment", "idem-001")
            .debit(src, kz(5000))
            .credit(dst, kz(5000))
            .build()
            .unwrap();
        assert!(posting.assert_balanced().is_ok());
    }

    #[test]
    fn unbalanced_posting_is_rejected() {
        let src = account();
        let dst = account();
        let result = PostingBuilder::new("bad payment", "idem-002")
            .debit(src, kz(5000))
            .credit(dst, kz(4999))
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn single_entry_is_rejected() {
        let result = PostingBuilder::new("incomplete", "idem-003")
            .debit(account(), kz(1000))
            .build();
        assert!(matches!(result, Err(PostingError::InsufficientEntries)));
    }

    #[test]
    fn multi_leg_posting_balances() {
        let src = account();
        let fee_account = account();
        let merchant = account();
        // 5000 debit on src = 4800 credit to merchant + 200 credit to fee
        let posting = PostingBuilder::new("payment with fee", "idem-004")
            .debit(src, kz(5000))
            .credit(merchant, kz(4800))
            .credit(fee_account, kz(200))
            .build()
            .unwrap();
        assert!(posting.assert_balanced().is_ok());
    }
}
