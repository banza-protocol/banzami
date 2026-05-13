pub mod engine;
pub mod repository;
pub mod transfer;

pub use engine::{PostgresTransferEngine, TransferEngine};
pub use repository::{PostgresTransferRepository, TransferRepository};
pub use transfer::{SendTransferRequest, Transfer, TransferStatus};

use thiserror::Error;

use banzami_types::{ConsumerId, Currency, Money, TransferId};

#[derive(Debug, Error)]
pub enum TransferError {
    #[error("transfer {0} not found")]
    NotFound(TransferId),

    #[error("self-transfer is not allowed")]
    SelfTransfer,

    #[error("amount_minor must be positive")]
    InvalidAmount,

    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientFunds {
        available: Money,
        requested: Money,
    },

    #[error("no active wallet for consumer {consumer_id} in {currency}")]
    WalletNotFound {
        consumer_id: ConsumerId,
        currency:    Currency,
    },

    #[error("wallet for consumer {0} is not active")]
    WalletNotActive(ConsumerId),

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    #[error("unknown currency code: {0}")]
    UnknownCurrency(String),

    #[error("unknown transfer status: {0}")]
    UnknownStatus(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
