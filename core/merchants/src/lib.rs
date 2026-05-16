pub mod api_key;
pub mod engine;
pub mod merchant;
pub mod repository;

pub use api_key::{ApiKey, ApiKeyEnvironment, ApiKeySecret};
pub use engine::{MerchantEngine, PostgresMerchantEngine};
pub use merchant::{CreateMerchantRequest, Merchant, MerchantStatus};
pub use repository::{
    ApiKeyRepository, MerchantRepository, PostgresApiKeyRepository, PostgresMerchantRepository,
};

use banzami_types::{ApiKeyId, MerchantId};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MerchantError {
    #[error("merchant {0} not found")]
    NotFound(MerchantId),

    #[error("API key {0} not found")]
    ApiKeyNotFound(ApiKeyId),

    #[error("email already registered: {0}")]
    DuplicateEmail(String),

    #[error("merchant {0} is not active")]
    NotActive(MerchantId),

    #[error("API key has been revoked: {0}")]
    RevokedApiKey(ApiKeyId),

    #[error("invalid API key")]
    InvalidApiKey,

    #[error("unknown merchant status: {0}")]
    UnknownStatus(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
