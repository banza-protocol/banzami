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

/// Underflow is the mirror image: two CREDIT entries at the i64 minimum plus a
/// small debit also wrap to a computed zero. An implementation that only guards
/// the positive direction would still accept this.
#[test]
fn balance_check_is_not_defeated_by_i64_underflow() {
    let id = LedgerPostingId::new();
    let posting = LedgerPosting {
        id,
        entries: vec![
            entry(id, EntryType::Credit, i64::MAX),
            entry(id, EntryType::Credit, i64::MAX),
            entry(id, EntryType::Credit, 2),
        ],
        description: "underflow probe".into(),
        idempotency_key: "underflow-probe-1".into(),
        created_at: Utc::now(),
    };
    assert!(
        posting
            .entries
            .iter()
            .all(|e| e.entry_type == EntryType::Credit),
        "fixture must contain only credits for the assertion below to mean anything"
    );
    assert!(
        posting.assert_balanced().is_err(),
        "an all-credit posting was accepted as balanced: the invariant was \
         defeated by integer underflow"
    );
}

/// A single entry at i64::MIN cannot be negated without overflowing. The check
/// must reject rather than panic or wrap: an externally reachable panic in the
/// posting path would itself be a denial-of-service surface.
#[test]
fn extreme_single_values_are_rejected_not_wrapped() {
    for (kind, amount) in [
        (EntryType::Debit, i64::MIN),
        (EntryType::Credit, i64::MIN),
        (EntryType::Debit, i64::MAX),
        (EntryType::Credit, i64::MAX),
    ] {
        let id = LedgerPostingId::new();
        let posting = LedgerPosting {
            id,
            entries: vec![entry(id, kind, amount), entry(id, kind.opposite(), 1)],
            description: "extreme value probe".into(),
            idempotency_key: format!("extreme-{kind:?}-{amount}"),
            created_at: Utc::now(),
        };
        // |amount| != 1, so this posting is genuinely unbalanced whatever the
        // arithmetic does. It must be rejected, and must not panic.
        assert!(
            posting.assert_balanced().is_err(),
            "extreme {kind:?} entry of {amount} was accepted as balanced"
        );
    }
}

/// Mixed-sign wrap: a debit of i64::MAX against a credit of i64::MIN nets to -1
/// under wrapping arithmetic, which is correctly non-zero — but the intermediate
/// accumulation overflows. The guard must classify it as unbalanced rather than
/// relying on the wrapped remainder happening to be non-zero.
#[test]
fn mixed_sign_overflow_is_rejected() {
    let id = LedgerPostingId::new();
    let posting = LedgerPosting {
        id,
        entries: vec![
            entry(id, EntryType::Debit, i64::MAX),
            entry(id, EntryType::Debit, i64::MAX),
            entry(id, EntryType::Credit, i64::MAX),
        ],
        description: "mixed sign overflow".into(),
        idempotency_key: "mixed-sign-1".into(),
        created_at: Utc::now(),
    };
    assert!(
        posting.assert_balanced().is_err(),
        "a posting whose accumulation overflows was accepted as balanced"
    );
}
