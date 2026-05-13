pub mod engine;
pub mod identity;
pub mod repository;

pub use engine::{IdentityEngine, PostgresIdentityEngine};
pub use identity::{
    normalize_handle, validate_handle, ConsumerIdentity, ConsumerStatus, CreateConsumerRequest,
};
pub use repository::{IdentityRepository, PostgresIdentityRepository};

use thiserror::Error;

use banzami_types::ConsumerId;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("consumer {0} not found")]
    NotFound(ConsumerId),

    #[error("handle '{0}' not found")]
    HandleNotFound(String),

    #[error("handle '{0}' is already taken")]
    HandleTaken(String),

    #[error("invalid handle: {0}")]
    InvalidHandle(&'static str),

    #[error("invalid status transition: {from:?} → {to:?}")]
    InvalidStatusTransition {
        from: ConsumerStatus,
        to:   ConsumerStatus,
    },

    #[error("unknown consumer status: {0}")]
    UnknownStatus(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
