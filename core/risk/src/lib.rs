mod engine;

pub use engine::{RiskContext, RiskEngine, RiskLimits, RiskRequest, StaticRiskEngine};

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{MerchantId, Money, TransactionId};

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/// Outcome of a risk evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskDecision {
    /// Transaction may proceed to authorization.
    Allow,
    /// Transaction declined; do not authorize.
    Decline,
}

// ---------------------------------------------------------------------------
// Signals — individual flags raised during evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RiskSignals {
    pub amount_exceeds_limit: bool,
    pub hourly_velocity_breach: bool,
    pub daily_amount_breach: bool,
}

impl RiskSignals {
    pub fn any_breach(&self) -> bool {
        self.amount_exceeds_limit || self.hourly_velocity_breach || self.daily_amount_breach
    }
}

// ---------------------------------------------------------------------------
// Assessment — returned from every evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RiskAssessment {
    pub transaction_id: TransactionId,
    pub merchant_id:    MerchantId,
    pub amount:         Money,
    pub decision:       RiskDecision,
    pub signals:        RiskSignals,
    /// Human-readable explanation when decision = Decline.
    pub decline_reason: Option<String>,
    pub assessed_at:    DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum RiskError {
    #[error("risk engine unavailable")]
    EngineUnavailable,
}
