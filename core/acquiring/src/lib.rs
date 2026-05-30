pub mod engine;
pub mod provider;
pub mod providers;
pub mod repository;

pub use engine::{AcquirerKind, AcquiringEngine, PostgresAcquiringEngine};
pub use provider::AcquirerProvider;
pub use providers::{EMISProvider, SimulatedProvider};
pub use repository::{AcquiringRepository, PostgresAcquiringRepository};

use crate::provider::{AcquirerError, PaymentInstructions};
use banzami_types::{AcquiringPaymentId, Money, PaymentLinkId};
use chrono::{DateTime, Utc};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AcquiringPaymentStatus {
    Pending,
    Confirmed,
    Failed,
}

impl AcquiringPaymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Confirmed => "CONFIRMED",
            Self::Failed => "FAILED",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AcquiringPayment {
    pub id: AcquiringPaymentId,
    pub payment_link_id: PaymentLinkId,
    pub provider: String,
    pub external_ref: String,
    pub status: AcquiringPaymentStatus,
    pub amount: Money,
    pub instructions: PaymentInstructions,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub failed_at: Option<DateTime<Utc>>,
    pub failure_reason: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub struct AcquiringCallback {
    pub id: uuid::Uuid,
    pub provider: String,
    pub raw_payload: serde_json::Value,
    pub signature: String,
    pub external_ref: Option<String>,
    pub idempotency_key: String,
    pub received_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum AcquiringError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("acquiring payment not found: {0}")]
    NotFound(AcquiringPaymentId),

    #[error("no acquiring payment with external ref: {0}")]
    ExternalRefNotFound(String),

    #[error("unknown payment status: {0}")]
    UnknownStatus(String),

    #[error("provider error: {0}")]
    Provider(AcquirerError),

    #[error("internal error: {0}")]
    Internal(String),
}
