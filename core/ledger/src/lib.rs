pub mod account;
pub mod entry;
pub mod posting;

pub use account::{Account, AccountType};
pub use entry::{EntryType, LedgerEntry};
pub use posting::{LedgerPosting, PostingBuilder, PostingError};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum LedgerError {
    #[error("posting is not balanced: debits {debits_minor} ≠ credits {credits_minor} ({currency})")]
    UnbalancedPosting {
        debits_minor: i64,
        credits_minor: i64,
        currency: banzami_types::Currency,
    },

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("account not found: {0}")]
    AccountNotFound(banzami_types::AccountId),

    #[error("currency mismatch on account {account}: expected {expected}, got {got}")]
    AccountCurrencyMismatch {
        account: banzami_types::AccountId,
        expected: banzami_types::Currency,
        got: banzami_types::Currency,
    },

    #[error("posting must have at least two entries")]
    InsufficientEntries,

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
