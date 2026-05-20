pub mod account;
pub mod engine;
pub mod entry;
pub mod posting;
pub mod repository;

pub use account::{Account, AccountType};
pub use engine::LedgerEngine;
pub use entry::{EntryType, LedgerEntry};
pub use posting::{LedgerPosting, PostingBuilder, PostingError};
pub use repository::PostgresLedgerRepository;

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

    #[error("unknown currency code: {0}")]
    UnknownCurrency(String),

    #[error("unknown account type: {0}")]
    UnknownAccountType(String),

    #[error("unknown entry type: {0}")]
    UnknownEntryType(String),

    #[error("posting not found: {0}")]
    PostingNotFound(banzami_types::LedgerPostingId),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),
}
