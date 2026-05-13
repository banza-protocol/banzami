pub mod engine;
pub mod expiry_worker;
pub mod payment_link;
pub mod repository;

pub use engine::{PaymentLinkEngine, PostgresPaymentLinkEngine};
pub use expiry_worker::run_expiry_worker;
pub use payment_link::{
    CreatePaymentLinkRequest, PaymentLink, PaymentLinkStatus,
};
pub use repository::{PaymentLinkRepository, PostgresPaymentLinkRepository};

use banzami_types::PaymentLinkId;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PaymentLinkError {
    #[error("payment link {0} not found")]
    NotFound(PaymentLinkId),

    #[error("payment link with slug '{0}' not found")]
    SlugNotFound(String),

    #[error("payment link {0} is not active")]
    NotActive(PaymentLinkId),

    #[error("payment link {0} has expired")]
    Expired(PaymentLinkId),

    #[error("amount_minor must be positive")]
    InvalidAmount,

    #[error("expires_at must be in the future")]
    ExpiryInPast,

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
