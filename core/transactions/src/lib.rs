pub mod engine;
pub mod operator_fee_read;
pub mod repository;
pub mod transaction;

pub use engine::{PostgresTransactionEngine, TransactionEngine};
pub use operator_fee_read::{
    OperatorFeeFilter, OperatorFeeView, PostgresOperatorFeeReadRepository,
};
pub use repository::{PostgresTransactionRepository, TransactionRepository};
pub use transaction::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, FailRequest, ReverseRequest,
    Transaction, TransactionStatus, TransactionType,
};

use thiserror::Error;

use banzami_types::{MerchantId, MoneyError, TransactionId, WalletId};

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("transaction {0} not found")]
    NotFound(TransactionId),

    /// The named wallet is not owned by the merchant creating the transaction.
    /// RA-056 — same invariant as payouts: naming a wallet is not authority
    /// over it.
    #[error("wallet {wallet_id} is not owned by merchant {merchant_id}")]
    WalletNotOwned {
        wallet_id: WalletId,
        merchant_id: MerchantId,
    },

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: TransactionStatus,
        to: TransactionStatus,
    },

    #[error("duplicate idempotency key: {0}")]
    DuplicateIdempotencyKey(String),

    /// No operator pricing rule applied to this capture.
    ///
    /// This used to be a fee of zero. The comment beside the resolver said so
    /// plainly — "no category => an empty reference that matches no rule => 0
    /// fee" — and it is the same defect the settlement path had: an absent
    /// pricing decision and a decision of zero produce the same number and are
    /// entirely different facts. One is a policy; the other is nobody having
    /// chosen. Money moves at capture, so capture is where this has to refuse.
    #[error("no pricing rule applies to this transaction")]
    PricingNotConfigured,

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

    #[error("operator fee {fee} exceeds transaction amount {amount} (net would be negative)")]
    FeeExceedsAmount { fee: i64, amount: i64 },

    #[error("pricing error: {0}")]
    Pricing(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
