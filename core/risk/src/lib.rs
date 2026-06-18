mod engine;

pub use engine::{RiskContext, RiskEngine, RiskLimits, RiskRequest, StaticRiskEngine};

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{MerchantId, Money, TransactionId};

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/// Outcome of a risk evaluation.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskDecision {
    /// Transaction may proceed to authorization.
    Allow,
    /// Transaction may proceed but is flagged for operator review (soft signals
    /// such as a high-value payment from a young account or unrecognized device).
    Review,
    /// Transaction declined; do not authorize.
    Decline,
}

// ---------------------------------------------------------------------------
// Signals — individual flags raised during evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RiskSignals {
    pub amount_exceeds_limit: bool,
    pub hourly_velocity_breach: bool,
    pub daily_amount_breach: bool,
    /// Account signal: a high-value transaction from a recently-created account.
    pub young_account_high_value: bool,
    /// Device signal: a high-value transaction from a device not seen before for
    /// this entity.
    pub unrecognized_device_high_value: bool,
}

impl RiskSignals {
    /// Hard limit breaches — the transaction is declined.
    pub fn any_breach(&self) -> bool {
        self.amount_exceeds_limit || self.hourly_velocity_breach || self.daily_amount_breach
    }

    /// Soft account/device signals — the transaction proceeds but is flagged.
    pub fn needs_review(&self) -> bool {
        self.young_account_high_value || self.unrecognized_device_high_value
    }
}

// ---------------------------------------------------------------------------
// Assessment — returned from every evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RiskAssessment {
    pub transaction_id: TransactionId,
    pub merchant_id: MerchantId,
    pub amount: Money,
    pub decision: RiskDecision,
    pub signals: RiskSignals,
    /// Human-readable explanation when decision = Decline.
    pub decline_reason: Option<String>,
    pub assessed_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum RiskError {
    #[error("risk engine unavailable")]
    EngineUnavailable,
}
