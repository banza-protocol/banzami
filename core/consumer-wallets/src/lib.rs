pub mod engine;
pub mod funding;
pub mod onboarding;
pub mod repository;
pub mod routing;
pub mod wallet;

pub use engine::{ConsumerWalletEngine, PostgresConsumerWalletEngine};
pub use routing::{RoutingStatus, WalletRoutingDestination};
pub use funding::{
    CreateFundingSessionRequest, FundingEngine, FundingError, FundingProvider, FundingSession,
    FundingStatus, PostgresFundingEngine, ReceiveCallbackRequest, ReconcileRequest,
};
pub use onboarding::{CompletedOnboarding, OnboardingSession, OnboardingStatus};
pub use repository::{
    ConsumerWalletRepository, OnboardingRepository,
    PostgresConsumerWalletRepository, PostgresOnboardingRepository,
};
pub use wallet::{
    ChangePinRequest,
    CommitReservedRequest,
    CompleteOnboardingRequest,
    ConsumerWallet,
    ConsumerWalletBalance,
    ConsumerWalletStatus,
    CreateConsumerWalletRequest,
    KycStatus,
    ReleaseRequest,
    ReservationStatus,
    ReserveRequest,
    StartOnboardingRequest,
    VerifyOtpRequest,
    VerifyPinRequest,
    WalletReservation,
};

use thiserror::Error;
use uuid::Uuid;

use banzami_types::{ConsumerId, ConsumerWalletId, Currency, MoneyError};

#[derive(Debug, Error)]
pub enum ConsumerWalletError {
    #[error("consumer wallet {0} not found")]
    NotFound(ConsumerWalletId),

    #[error("onboarding session {0} not found")]
    OnboardingNotFound(Uuid),

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

    #[error("duplicate wallet: consumer already has an active wallet in this currency")]
    DuplicateWallet,

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

    #[error("handle '{0}' not found")]
    HandleNotFound(String),

    #[error("handle '{0}' is already taken")]
    HandleTaken(String),

    #[error("invalid handle: {0}")]
    InvalidHandle(&'static str),

    #[error("identity for handle '{0}' is suspended")]
    SuspendedIdentity(String),

    #[error("identity for handle '{0}' is closed")]
    ClosedIdentity(String),

    #[error("wallet {0} cannot receive funds — status does not permit inbound transfers")]
    WalletCannotReceive(ConsumerWalletId),

    #[error("routing unavailable for handle '{0}'")]
    RoutingUnavailable(String),

    #[error("PIN not set on wallet {0}")]
    PinNotSet(ConsumerWalletId),

    #[error("PIN is incorrect")]
    PinInvalid,

    #[error("wallet {0} is locked due to too many failed PIN attempts")]
    WalletLocked(ConsumerWalletId),

    #[error("reservation {0} not found")]
    ReservationNotFound(uuid::Uuid),

    #[error("reservation {0} is not in ACTIVE status — cannot release or commit")]
    ReservationNotActive(uuid::Uuid),

    #[error("OTP is invalid or expired")]
    OtpInvalid,

    #[error("onboarding session {0} has expired")]
    OnboardingExpiredSession(Uuid),

    #[error("onboarding session for wallet {0} has expired")]
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
