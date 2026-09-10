pub mod api_key;
pub mod engine;
pub mod merchant;
pub mod repository;

pub use api_key::{ApiKey, ApiKeyEnvironment, ApiKeySecret};
pub use engine::{MerchantEngine, PostgresMerchantEngine};
pub use merchant::{
    allows_application_fee, is_valid_business_account_type, CreateMerchantRequest, Merchant,
    MerchantStatus, APPLICATION_FEE_TYPES, BUSINESS_ACCOUNT_TYPES,
};
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

    /// ADR-028: not one of the valid operator business account types.
    #[error("invalid business account type: {0}")]
    InvalidBusinessAccountType(String),

    /// A stored key whose environment is neither SANDBOX nor LIVE. Refused
    /// rather than read as LIVE.
    #[error("API key has an unknown environment: {0}")]
    UnknownApiKeyEnvironment(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
