//! INV-LEDGER: the double-entry balance invariant must not be defeatable by
//! integer overflow.
//!
//! `assert_balanced` sums each entry's signed minor units. Summing i64 with
//! wrapping arithmetic lets a set of entries whose REAL total is non-zero wrap
//! around to a computed total of exactly zero — the posting then reports itself
//! balanced while creating value out of nothing.

use banzami_ledger::{EntryType, LedgerEntry, LedgerPosting};
use banzami_types::{AccountId, Currency, LedgerEntryId, LedgerPostingId, Money};
use chrono::Utc;

fn entry(posting_id: LedgerPostingId, kind: EntryType, minor: i64) -> LedgerEntry {
    LedgerEntry {
        id: LedgerEntryId::new(),
        posting_id,
        account_id: AccountId::new(),
        entry_type: kind,
        amount: Money::new(minor, Currency::AOA),
        created_at: Utc::now(),
    }
}

/// Three DEBIT entries and no credits at all. Their true sum is
/// i64::MAX + i64::MAX + 2, which wraps to exactly 0 in two's complement.
/// A wrapping implementation therefore calls this "balanced" — a posting that
/// debits with no matching credit, i.e. money created from nothing.
#[test]
fn balance_check_is_not_defeated_by_i64_overflow() {
    let id = LedgerPostingId::new();
    let posting = LedgerPosting {
        id,
        entries: vec![
            entry(id, EntryType::Debit, i64::MAX),
            entry(id, EntryType::Debit, i64::MAX),
            entry(id, EntryType::Debit, 2),
        ],
        description: "overflow probe".into(),
        idempotency_key: "overflow-probe-1".into(),
        created_at: Utc::now(),
    };

    // Sanity: this posting has zero credit entries, so it can never be balanced.
    assert!(
        posting
            .entries
            .iter()
            .all(|e| e.entry_type == EntryType::Debit),
        "fixture must contain only debits for the assertion below to mean anything"
    );

    assert!(
        posting.assert_balanced().is_err(),
        "an all-debit posting was accepted as balanced: the double-entry \
         invariant was defeated by integer overflow"
    );
}

/// A genuinely balanced posting must still be accepted — the overflow guard
/// must not reject legitimate postings.
#[test]
fn genuinely_balanced_posting_is_still_accepted() {
    let id = LedgerPostingId::new();
    let posting = LedgerPosting {
        id,
        entries: vec![
            entry(id, EntryType::Debit, 100_000),
            entry(id, EntryType::Credit, 100_000),
        ],
        description: "normal transfer".into(),
        idempotency_key: "normal-1".into(),
        created_at: Utc::now(),
    };
    assert!(
        posting.assert_balanced().is_ok(),
        "a balanced posting was rejected"
    );
}
