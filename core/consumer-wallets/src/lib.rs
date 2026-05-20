pub mod engine;
pub mod repository;
pub mod wallet;

pub use engine::{ConsumerWalletEngine, PostgresConsumerWalletEngine};
pub use repository::{ConsumerWalletRepository, PostgresConsumerWalletRepository};
pub use wallet::{
    ChangePinRequest,
    CompleteOnboardingRequest,
    ConsumerWallet,
    ConsumerWalletBalance,
    ConsumerWalletStatus,
    CreateConsumerWalletRequest,
    KycStatus,
    ReleaseRequest,
    ReserveRequest,
    SettleRequest,
    StartOnboardingRequest,
    VerifyOtpRequest,
    VerifyPinRequest,
};

use thiserror::Error;

use banzami_types::{ConsumerId, ConsumerWalletId, Currency, MoneyError};

#[derive(Debug, Error)]
pub enum ConsumerWalletError {
    #[error("consumer wallet {0} not found")]
    NotFound(ConsumerWalletId),

    #[error("no active wallet for consumer {consumer_id} in {currency}")]
    NoWalletForConsumer {
        consumer_id: ConsumerId,
        currency:    Currency,
    },

    #[error("wallet {0} is not active")]
    NotActive(ConsumerWalletId),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: ConsumerWalletStatus,
        to:   ConsumerWalletStatus,
    },

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

    #[error("handle '{0}' is already taken")]
    HandleTaken(String),

    #[error("invalid handle: {0}")]
    InvalidHandle(&'static str),

    #[error("PIN not set on wallet {0}")]
    PinNotSet(ConsumerWalletId),

    #[error("PIN is incorrect")]
    PinInvalid,

    #[error("wallet {0} is locked due to too many failed PIN attempts")]
    WalletLocked(ConsumerWalletId),

    #[error("OTP is invalid or expired")]
    OtpInvalid,

    #[error("onboarding session expired for wallet {0}")]
    OnboardingExpired(ConsumerWalletId),

    #[error("unknown currency code: {0}")]
    UnknownCurrency(String),

    #[error("unknown wallet status: {0}")]
    UnknownStatus(String),

    #[error("unknown KYC status: {0}")]
    UnknownKycStatus(String),

    #[error("posting error: {0}")]
    Posting(String),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
