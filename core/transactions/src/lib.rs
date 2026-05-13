pub mod engine;
pub mod repository;
pub mod transaction;

pub use engine::{PostgresTransactionEngine, TransactionEngine};
pub use repository::{PostgresTransactionRepository, TransactionRepository};
pub use transaction::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, FailRequest, ReverseRequest,
    Transaction, TransactionStatus, TransactionType,
};

use thiserror::Error;

use banzami_types::{MoneyError, TransactionId};

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("transaction {0} not found")]
    NotFound(TransactionId),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: TransactionStatus,
        to:   TransactionStatus,
    },

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("unknown currency code: {0}")]
    UnknownCurrency(String),

    #[error("unknown transaction type: {0}")]
    UnknownTransactionType(String),

    #[error("unknown status: {0}")]
    UnknownStatus(String),

    #[error("wallet error: {0}")]
    Wallet(#[from] banzami_wallets::WalletError),

    #[error(transparent)]
    Money(#[from] MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
