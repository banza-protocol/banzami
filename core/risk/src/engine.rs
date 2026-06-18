use chrono::Utc;

use banzami_types::{MerchantId, Money, TransactionId};

use crate::{RiskAssessment, RiskDecision, RiskError, RiskSignals};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// Configurable thresholds for the static risk engine.
#[derive(Debug, Clone)]
pub struct RiskLimits {
    /// Maximum amount for a single transaction (minor units). 0 = no limit.
    pub max_single_amount_minor: i64,
    /// Maximum number of transactions per merchant in the trailing hour. 0 = no limit.
    pub max_hourly_count: u32,
    /// Maximum cumulative amount per merchant in the trailing day (minor units). 0 = no limit.
    pub max_daily_amount_minor: i64,
    /// Amount at/above which account + device signals trigger a review.
    /// 0 = account/device signals disabled.
    pub elevated_amount_minor: i64,
    /// Accounts younger than this (days) are "young" for the account signal.
    /// 0 = account-age signal disabled.
    pub min_account_age_days: u32,
}

impl RiskLimits {
    /// Conservative defaults suitable for an early-stage deployment.
    pub fn conservative() -> Self {
        Self {
            max_single_amount_minor: 50_000_000, // 500 000 Kz
            max_hourly_count: 100,
            max_daily_amount_minor: 500_000_000, // 5 000 000 Kz
            elevated_amount_minor: 10_000_000,   // 100 000 Kz — review threshold
            min_account_age_days: 7,
        }
    }
}

// ---------------------------------------------------------------------------
// Context — caller-supplied activity window
// ---------------------------------------------------------------------------

/// Observed activity for the merchant in the relevant time windows.
/// The caller (transaction engine) is responsible for querying this data
/// before calling the risk engine — keeping this crate DB-free.
#[derive(Debug, Clone)]
pub struct RiskContext {
    /// Number of transactions by this merchant in the trailing hour.
    pub hourly_count: u32,
    /// Total amount transacted by this merchant today (minor units).
    pub daily_amount_minor: i64,
    /// Age of the transacting account in days (account signal).
    pub account_age_days: u32,
    /// Whether the originating device has been seen before for this entity
    /// (device signal). `None` when no device context is available (e.g. a
    /// server-to-server merchant transaction).
    pub device_recognized: Option<bool>,
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

pub struct RiskRequest {
    pub transaction_id: TransactionId,
    pub merchant_id: MerchantId,
    pub amount: Money,
    pub context: RiskContext,
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait RiskEngine: Send + Sync {
    async fn evaluate(&self, req: RiskRequest) -> Result<RiskAssessment, RiskError>;
}

// ---------------------------------------------------------------------------
// Static (rule-based) implementation
// ---------------------------------------------------------------------------

pub struct StaticRiskEngine {
    limits: RiskLimits,
}

impl StaticRiskEngine {
    pub fn new(limits: RiskLimits) -> Self {
        Self { limits }
    }

    pub fn conservative() -> Self {
        Self::new(RiskLimits::conservative())
    }
}

impl RiskEngine for StaticRiskEngine {
    async fn evaluate(&self, req: RiskRequest) -> Result<RiskAssessment, RiskError> {
        let lim = &self.limits;
        let amount_minor = req.amount.amount_minor();

        let amount_exceeds_limit =
            lim.max_single_amount_minor > 0 && amount_minor > lim.max_single_amount_minor;

        let hourly_velocity_breach =
            lim.max_hourly_count > 0 && req.context.hourly_count >= lim.max_hourly_count;

        let daily_amount_breach = lim.max_daily_amount_minor > 0
            && req.context.daily_amount_minor.saturating_add(amount_minor)
                > lim.max_daily_amount_minor;

        // Account + device signals only matter for elevated amounts.
        let elevated = lim.elevated_amount_minor > 0 && amount_minor >= lim.elevated_amount_minor;
        let young_account_high_value = elevated
            && lim.min_account_age_days > 0
            && req.context.account_age_days < lim.min_account_age_days;
        let unrecognized_device_high_value =
            elevated && req.context.device_recognized == Some(false);

        let signals = RiskSignals {
            amount_exceeds_limit,
            hourly_velocity_breach,
            daily_amount_breach,
            young_account_high_value,
            unrecognized_device_high_value,
        };

        let (decision, decline_reason) = if signals.any_breach() {
            let reason = if amount_exceeds_limit {
                "transaction amount exceeds single-transaction limit"
            } else if hourly_velocity_breach {
                "hourly transaction velocity limit reached"
            } else {
                "daily amount limit would be exceeded"
            };
            (RiskDecision::Decline, Some(reason.to_owned()))
        } else if signals.needs_review() {
            // Soft signals — allow but flag for operator review.
            let reason = if young_account_high_value {
                "high-value transaction from a recently-created account — flagged for review"
            } else {
                "high-value transaction from an unrecognized device — flagged for review"
            };
            (RiskDecision::Review, Some(reason.to_owned()))
        } else {
            (RiskDecision::Allow, None)
        };

        if decision == RiskDecision::Decline {
            tracing::warn!(
                tx_id       = %req.transaction_id,
                merchant_id = %req.merchant_id,
                amount      = %req.amount,
                reason      = ?decline_reason,
                "transaction declined by risk engine"
            );
        }

        Ok(RiskAssessment {
            transaction_id: req.transaction_id,
            merchant_id: req.merchant_id,
            amount: req.amount,
            decision,
            signals,
            decline_reason,
            assessed_at: Utc::now(),
        })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use banzami_types::{Currency, MerchantId, Money, TransactionId};

    use super::*;
    use crate::RiskDecision;

    fn kz(minor: i64) -> Money {
        Money::new(minor, Currency::AOA)
    }

    fn req(amount: Money, context: RiskContext) -> RiskRequest {
        RiskRequest {
            transaction_id: TransactionId::new(),
            merchant_id: MerchantId::new(),
            amount,
            context,
        }
    }

    fn clean_ctx() -> RiskContext {
        RiskContext {
            hourly_count: 0,
            daily_amount_minor: 0,
            account_age_days: 365,
            device_recognized: None,
        }
    }

    #[tokio::test]
    async fn within_all_limits_is_allowed() {
        let engine = StaticRiskEngine::conservative();
        let assessment = engine
            .evaluate(req(kz(5_000_000), clean_ctx()))
            .await
            .unwrap();
        assert_eq!(assessment.decision, RiskDecision::Allow);
        assert!(assessment.decline_reason.is_none());
    }

    #[tokio::test]
    async fn amount_exceeds_single_limit_is_declined() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 100_000,
            max_hourly_count: 0,
            max_daily_amount_minor: 0,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        let assessment = engine
            .evaluate(req(kz(100_001), clean_ctx()))
            .await
            .unwrap();
        assert_eq!(assessment.decision, RiskDecision::Decline);
        assert!(assessment.signals.amount_exceeds_limit);
    }

    #[tokio::test]
    async fn hourly_velocity_breach_is_declined() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 0,
            max_hourly_count: 10,
            max_daily_amount_minor: 0,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        let ctx = RiskContext {
            hourly_count: 10,
            daily_amount_minor: 0,
            account_age_days: 365,
            device_recognized: None,
        };
        let assessment = engine.evaluate(req(kz(1_000), ctx)).await.unwrap();
        assert_eq!(assessment.decision, RiskDecision::Decline);
        assert!(assessment.signals.hourly_velocity_breach);
    }

    #[tokio::test]
    async fn daily_amount_would_exceed_limit_is_declined() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 0,
            max_hourly_count: 0,
            max_daily_amount_minor: 1_000_000,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        let ctx = RiskContext {
            hourly_count: 0,
            daily_amount_minor: 999_001,
            account_age_days: 365,
            device_recognized: None,
        };
        // 999_001 + 1_000 = 1_000_001 > 1_000_000
        let assessment = engine.evaluate(req(kz(1_000), ctx)).await.unwrap();
        assert_eq!(assessment.decision, RiskDecision::Decline);
        assert!(assessment.signals.daily_amount_breach);
    }

    #[tokio::test]
    async fn zero_limits_means_no_checks() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 0,
            max_hourly_count: 0,
            max_daily_amount_minor: 0,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        // Enormous amount — should still be allowed because all limits are 0 (disabled)
        let assessment = engine
            .evaluate(req(kz(i64::MAX / 2), clean_ctx()))
            .await
            .unwrap();
        assert_eq!(assessment.decision, RiskDecision::Allow);
    }

    #[tokio::test]
    async fn exactly_at_hourly_limit_is_declined() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 0,
            max_hourly_count: 5,
            max_daily_amount_minor: 0,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        // hourly_count == max → breach (>= comparison)
        let ctx = RiskContext {
            hourly_count: 5,
            daily_amount_minor: 0,
            account_age_days: 365,
            device_recognized: None,
        };
        let assessment = engine.evaluate(req(kz(100), ctx)).await.unwrap();
        assert_eq!(assessment.decision, RiskDecision::Decline);
    }

    #[tokio::test]
    async fn one_below_hourly_limit_is_allowed() {
        let engine = StaticRiskEngine::new(RiskLimits {
            max_single_amount_minor: 0,
            max_hourly_count: 5,
            max_daily_amount_minor: 0,
            elevated_amount_minor: 0,
            min_account_age_days: 0,
        });
        let ctx = RiskContext {
            hourly_count: 4,
            daily_amount_minor: 0,
            account_age_days: 365,
            device_recognized: None,
        };
        let assessment = engine.evaluate(req(kz(100), ctx)).await.unwrap();
        assert_eq!(assessment.decision, RiskDecision::Allow);
    }

    // --- account + device signals (RSK-001) ----------------------------------

    #[tokio::test]
    async fn young_account_high_value_is_flagged_for_review() {
        let engine = StaticRiskEngine::conservative();
        // 200 000 Kz: >= 100 000 elevated threshold, < 500 000 hard limit.
        let ctx = RiskContext {
            account_age_days: 2,
            ..clean_ctx()
        };
        let a = engine.evaluate(req(kz(20_000_000), ctx)).await.unwrap();
        assert_eq!(a.decision, RiskDecision::Review);
        assert!(a.signals.young_account_high_value);
    }

    #[tokio::test]
    async fn unrecognized_device_high_value_is_flagged_for_review() {
        let engine = StaticRiskEngine::conservative();
        let ctx = RiskContext {
            device_recognized: Some(false),
            ..clean_ctx()
        };
        let a = engine.evaluate(req(kz(20_000_000), ctx)).await.unwrap();
        assert_eq!(a.decision, RiskDecision::Review);
        assert!(a.signals.unrecognized_device_high_value);
    }

    #[tokio::test]
    async fn old_account_known_device_high_value_is_allowed() {
        let engine = StaticRiskEngine::conservative();
        // Old account (365d), recognized device, elevated but under the hard limit.
        let ctx = RiskContext {
            device_recognized: Some(true),
            ..clean_ctx()
        };
        let a = engine.evaluate(req(kz(20_000_000), ctx)).await.unwrap();
        assert_eq!(a.decision, RiskDecision::Allow);
    }
}
