use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{MerchantId, Money, TransactionId};

/// Decision output from the risk engine for a given transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskDecision {
    Allow,
    Review,
    Decline,
}

/// Risk signals used to compute the score.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RiskSignals {
    pub velocity_breach: bool,
    pub amount_exceeds_threshold: bool,
    pub merchant_high_risk: bool,
    pub unusual_hour: bool,
}

/// Result of evaluating a transaction against the risk engine.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RiskAssessment {
    pub transaction_id: TransactionId,
    pub merchant_id: MerchantId,
    pub amount: Money,
    /// 0–1000 scale; higher = riskier.
    pub score: u16,
    pub decision: RiskDecision,
    pub signals: RiskSignals,
    pub assessed_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum RiskError {
    #[error("risk engine unavailable")]
    EngineUnavailable,

    #[error("transaction declined by risk engine: score {score}")]
    Declined { score: u16 },
}
