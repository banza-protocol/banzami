pub mod engine;
pub mod repository;
pub mod wallet;

pub use engine::{PostgresWalletEngine, WalletEngine};
pub use repository::{PostgresWalletRepository, WalletRepository};
pub use wallet::{
    CreateWalletRequest, ReleaseRequest, ReserveRequest, SettleRequest, Wallet, WalletBalance,
    WalletStatus,
};

use thiserror::Error;

use banzami_types::{Currency, MerchantId, MoneyError, WalletId};

#[derive(Debug, Error)]
pub enum WalletError {
    #[error("wallet {0} not found")]
    NotFound(WalletId),

    #[error("no active wallet for merchant {merchant_id} in {currency}")]
    NoWalletForMerchant {
        merchant_id: MerchantId,
        currency:    Currency,
    },

    #[error("wallet {0} is not active — it may be suspended or closed")]
    NotActive(WalletId),

    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientFunds {
        available: banzami_types::Money,
        requested: banzami_types::Money,
    },

    #[error("currency mismatch: wallet is {wallet_currency}, operation is {operation_currency}")]
    CurrencyMismatch {
        wallet_currency:    Currency,
        operation_currency: Currency,
    },

    #[error("unknown currency code: {0}")]
    UnknownCurrency(String),

    #[error("unknown wallet status: {0}")]
    UnknownStatus(String),

    #[error("posting error: {0}")]
    Posting(String),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
