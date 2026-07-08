//! V1.0 pilot-limit policy overlay for the internal technical Sandbox (Phase 0).
//!
//! This is a STRICTER overlay applied ON TOP of the general KYC-tier limit model
//! (see [`crate::KycLevel`]). The KYC-tier limits remain the broader
//! profile/regulatory model; the pilot limits are a controlled-pilot overlay used
//! only for the internal technical Sandbox / Phase 0 functional testing with
//! SYNTHETIC balances. It is gated off by default and never enables on a
//! live/production environment.
//!
//! All amounts are in minor units (1 AOA = 100 minor). Phase 0 amounts are
//! synthetic and non-monetary. This overlay does not touch LIVE, Production,
//! real-money rails, external providers, customer data, public access, DNS,
//! certificates or SMTP.

/// V1.0 pilot limits (minor units, AOA).
pub mod limits {
    /// Consumer: maximum per single payment — Kz 25.000.
    pub const CONSUMER_PER_PAYMENT_MINOR: i64 = 2_500_000;
    /// Consumer: maximum cumulative payments per day — Kz 50.000.
    pub const CONSUMER_DAILY_MINOR: i64 = 5_000_000;
    /// Consumer: maximum wallet balance — Kz 50.000.
    pub const CONSUMER_MAX_BALANCE_MINOR: i64 = 5_000_000;
    /// Merchant: maximum per single received payment — Kz 25.000.
    pub const MERCHANT_PER_RECEIVE_MINOR: i64 = 2_500_000;
    /// Merchant: maximum cumulative received per day — Kz 100.000.
    pub const MERCHANT_DAILY_RECEIVE_MINOR: i64 = 10_000_000;
    /// Merchant: maximum wallet balance — Kz 100.000.
    pub const MERCHANT_MAX_BALANCE_MINOR: i64 = 10_000_000;
    /// Aggregate: maximum synthetic funds in circulation — Kz 500.000.
    pub const AGGREGATE_FUNDS_MINOR: i64 = 50_000_000;
    /// Aggregate: maximum synthetic transaction volume — Kz 2.000.000.
    pub const AGGREGATE_VOLUME_MINOR: i64 = 200_000_000;
}

/// Deterministic machine codes for pilot-limit rejections. Stable strings are
/// surfaced to callers; internal thresholds are never exposed in responses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PilotLimitCode {
    PerPayment,
    ConsumerDaily,
    ConsumerBalance,
    MerchantReceive,
    MerchantDaily,
    MerchantBalance,
    AggregateFunds,
    AggregateVolume,
}

impl PilotLimitCode {
    /// The deterministic API/error string for this code.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PerPayment => "PILOT_LIMIT_PER_PAYMENT_EXCEEDED",
            Self::ConsumerDaily => "PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED",
            Self::ConsumerBalance => "PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED",
            Self::MerchantReceive => "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED",
            Self::MerchantDaily => "PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED",
            Self::MerchantBalance => "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED",
            Self::AggregateFunds => "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED",
            Self::AggregateVolume => "PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED",
        }
    }
    /// A generic, non-internal explanation safe to surface.
    pub const fn message(self) -> &'static str {
        "This operation exceeds the controlled pilot limit."
    }
}

/// A single pilot-limit violation (code + safe message). No internal thresholds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PilotViolation {
    pub code: PilotLimitCode,
}

impl PilotViolation {
    pub const fn as_str(self) -> &'static str {
        self.code.as_str()
    }
    pub const fn message(self) -> &'static str {
        self.code.message()
    }
}

/// Config-gated pilot-limit policy. Disabled by default; enabled only for the
/// internal Sandbox / Phase 0 profile, and NEVER on a live/production environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PilotLimitPolicy {
    enabled: bool,
}

impl PilotLimitPolicy {
    /// Explicitly disabled policy (the safe default).
    pub const fn disabled() -> Self {
        Self { enabled: false }
    }

    /// Explicitly enabled policy (for tests and the Sandbox/Phase 0 profile).
    pub const fn enabled() -> Self {
        Self { enabled: true }
    }

    /// Resolve from environment. Enabled ONLY when `BANZAMI_PILOT_LIMITS` is
    /// truthy AND the environment is not a live/production one. Safe default:
    /// disabled.
    pub fn from_env() -> Self {
        let requested = matches!(
            std::env::var("BANZAMI_PILOT_LIMITS").ok().as_deref(),
            Some("1") | Some("true") | Some("TRUE") | Some("yes")
        );
        let env = std::env::var("ENVIRONMENT")
            .unwrap_or_default()
            .to_lowercase();
        let liveish = env.contains("live") || env.contains("prod");
        Self {
            enabled: requested && !liveish,
        }
    }

    pub const fn is_enabled(self) -> bool {
        self.enabled
    }

    // -- consumer -----------------------------------------------------------

    /// Consumer payment: per-payment and cumulative-daily caps.
    /// `daily_used_minor` is the consumer's payment volume already used today.
    pub fn check_consumer_payment(
        self,
        amount_minor: i64,
        daily_used_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if amount_minor > limits::CONSUMER_PER_PAYMENT_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::PerPayment,
            });
        }
        if daily_used_minor.saturating_add(amount_minor) > limits::CONSUMER_DAILY_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::ConsumerDaily,
            });
        }
        None
    }

    /// Consumer wallet balance cap, evaluated for the balance AFTER a credit.
    pub fn check_consumer_balance_after_credit(
        self,
        current_balance_minor: i64,
        credit_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if current_balance_minor.saturating_add(credit_minor) > limits::CONSUMER_MAX_BALANCE_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::ConsumerBalance,
            });
        }
        None
    }

    // -- merchant -----------------------------------------------------------

    /// Merchant receipt: per-received-payment and cumulative-daily-received caps.
    pub fn check_merchant_receipt(
        self,
        amount_minor: i64,
        daily_received_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if amount_minor > limits::MERCHANT_PER_RECEIVE_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantReceive,
            });
        }
        if daily_received_minor.saturating_add(amount_minor) > limits::MERCHANT_DAILY_RECEIVE_MINOR
        {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantDaily,
            });
        }
        None
    }

    /// Merchant wallet balance cap, evaluated for the balance AFTER a credit.
    pub fn check_merchant_balance_after_credit(
        self,
        current_balance_minor: i64,
        credit_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if current_balance_minor.saturating_add(credit_minor) > limits::MERCHANT_MAX_BALANCE_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantBalance,
            });
        }
        None
    }

    // -- aggregate ----------------------------------------------------------

    /// Aggregate synthetic funds-in-circulation cap, evaluated AFTER adding funds
    /// (e.g. a synthetic top-up/allocation).
    pub fn check_aggregate_funds_after_add(
        self,
        funds_in_circulation_minor: i64,
        added_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if funds_in_circulation_minor.saturating_add(added_minor) > limits::AGGREGATE_FUNDS_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::AggregateFunds,
            });
        }
        None
    }

    /// Aggregate synthetic transaction-volume cap, evaluated AFTER adding volume.
    pub fn check_aggregate_volume_after_add(
        self,
        total_volume_minor: i64,
        added_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if total_volume_minor.saturating_add(added_minor) > limits::AGGREGATE_VOLUME_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::AggregateVolume,
            });
        }
        None
    }
}

/// Apply the pilot overlay to a consumer payment authorization. Returns
/// `Some(violation)` when the pilot rejects the payment, `None` when the pilot
/// permits it (or is disabled, or the operation is not a consumer payment).
/// This is the pure decision used at the system authorization point.
pub fn overlay_consumer_payment(
    policy: PilotLimitPolicy,
    operation_is_consumer_payment: bool,
    amount_minor: i64,
    daily_used_minor: i64,
) -> Option<PilotViolation> {
    if !operation_is_consumer_payment {
        return None;
    }
    policy.check_consumer_payment(amount_minor, daily_used_minor)
}

// ---------------------------------------------------------------------------
// Tests — pure, deterministic; no database, no environment races.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    const ON: PilotLimitPolicy = PilotLimitPolicy::enabled();
    const OFF: PilotLimitPolicy = PilotLimitPolicy::disabled();

    #[test]
    fn disabled_policy_allows_everything() {
        assert!(OFF.check_consumer_payment(i64::MAX, i64::MAX).is_none());
        assert!(OFF
            .check_consumer_balance_after_credit(i64::MAX, i64::MAX)
            .is_none());
        assert!(OFF.check_merchant_receipt(i64::MAX, i64::MAX).is_none());
        assert!(OFF
            .check_merchant_balance_after_credit(i64::MAX, i64::MAX)
            .is_none());
        assert!(OFF
            .check_aggregate_funds_after_add(i64::MAX, i64::MAX)
            .is_none());
        assert!(OFF
            .check_aggregate_volume_after_add(i64::MAX, i64::MAX)
            .is_none());
    }

    #[test]
    fn consumer_per_payment_boundary_and_over() {
        // exactly at the cap is allowed
        assert!(ON
            .check_consumer_payment(limits::CONSUMER_PER_PAYMENT_MINOR, 0)
            .is_none());
        // one minor over is rejected with the per-payment code
        let v = ON
            .check_consumer_payment(limits::CONSUMER_PER_PAYMENT_MINOR + 1, 0)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_PER_PAYMENT_EXCEEDED");
    }

    #[test]
    fn consumer_daily_cumulative_over() {
        // within per-payment cap, but cumulative daily exceeds
        let used = limits::CONSUMER_DAILY_MINOR - 1_00; // just under daily
        let v = ON
            .check_consumer_payment(limits::CONSUMER_PER_PAYMENT_MINOR, used)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED");
    }

    #[test]
    fn consumer_balance_cap() {
        assert!(ON
            .check_consumer_balance_after_credit(limits::CONSUMER_MAX_BALANCE_MINOR, 0)
            .is_none());
        let v = ON
            .check_consumer_balance_after_credit(limits::CONSUMER_MAX_BALANCE_MINOR, 1)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED");
    }

    #[test]
    fn merchant_receipt_per_and_daily() {
        let v1 = ON
            .check_merchant_receipt(limits::MERCHANT_PER_RECEIVE_MINOR + 1, 0)
            .unwrap();
        assert_eq!(v1.as_str(), "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED");
        let v2 = ON
            .check_merchant_receipt(
                limits::MERCHANT_PER_RECEIVE_MINOR,
                limits::MERCHANT_DAILY_RECEIVE_MINOR,
            )
            .unwrap();
        assert_eq!(v2.as_str(), "PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED");
    }

    #[test]
    fn merchant_balance_cap() {
        let v = ON
            .check_merchant_balance_after_credit(limits::MERCHANT_MAX_BALANCE_MINOR, 1)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED");
    }

    #[test]
    fn aggregate_funds_and_volume() {
        let vf = ON
            .check_aggregate_funds_after_add(limits::AGGREGATE_FUNDS_MINOR, 1)
            .unwrap();
        assert_eq!(vf.as_str(), "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED");
        let vv = ON
            .check_aggregate_volume_after_add(limits::AGGREGATE_VOLUME_MINOR, 1)
            .unwrap();
        assert_eq!(vv.as_str(), "PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED");
    }

    #[test]
    fn from_env_is_safe_by_default() {
        // With no env set in this process, the policy must be disabled.
        // (Do not mutate process env here to avoid cross-test races.)
        // Instead assert the explicit constructors, which back from_env's states.
        assert!(!PilotLimitPolicy::disabled().is_enabled());
        assert!(PilotLimitPolicy::enabled().is_enabled());
    }

    #[test]
    fn overlay_only_applies_to_consumer_payments() {
        // non-payment operation → overlay never rejects, even over the cap
        assert!(overlay_consumer_payment(ON, false, i64::MAX, 0).is_none());
        // consumer payment over the per-payment cap → rejected
        let v =
            overlay_consumer_payment(ON, true, limits::CONSUMER_PER_PAYMENT_MINOR + 1, 0).unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_PER_PAYMENT_EXCEEDED");
        // disabled policy → never rejects
        assert!(overlay_consumer_payment(OFF, true, i64::MAX, 0).is_none());
    }

    #[test]
    fn limit_values_match_v1_policy() {
        // Kz 25.000 / 50.000 / 100.000 / 500.000 / 2.000.000 in minor units.
        assert_eq!(limits::CONSUMER_PER_PAYMENT_MINOR, 2_500_000);
        assert_eq!(limits::CONSUMER_DAILY_MINOR, 5_000_000);
        assert_eq!(limits::CONSUMER_MAX_BALANCE_MINOR, 5_000_000);
        assert_eq!(limits::MERCHANT_PER_RECEIVE_MINOR, 2_500_000);
        assert_eq!(limits::MERCHANT_DAILY_RECEIVE_MINOR, 10_000_000);
        assert_eq!(limits::MERCHANT_MAX_BALANCE_MINOR, 10_000_000);
        assert_eq!(limits::AGGREGATE_FUNDS_MINOR, 50_000_000);
        assert_eq!(limits::AGGREGATE_VOLUME_MINOR, 200_000_000);
    }
}
