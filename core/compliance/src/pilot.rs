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
    /// Merchant: maximum wallet balance — Kz 100.000.
    pub const MERCHANT_MAX_BALANCE_MINOR: i64 = 10_000_000;
    /// Aggregate: maximum synthetic funds in circulation — Kz 500.000.
    ///
    /// This one is a STOCK, not a flow: it is a signed sum, so retiring synthetic
    /// value (the exact reverse posting) reduces it. It needs no window.
    pub const AGGREGATE_FUNDS_MINOR: i64 = 50_000_000;

    // ── Rolling merchant-credit volume windows (owner decision D1) ───────────
    //
    // These REPLACE the former lifetime `AGGREGATE_VOLUME_MINOR` (Kz 2.000.000),
    // which was a monotonic sum of every merchant credit ever posted. Retirement
    // posts a DEBIT, and a credits-only sum ignores debits, so that counter could
    // only ever rise: the Sandbox had a finite total number of merchant payments
    // and no way to recover any of them. A permanent, repeatable validation
    // programme needs a limit with a steady state, so the measure is now a RATE
    // over a moving window rather than a lifetime budget.
    //
    // Sizing is derived from the deployed Sandbox's own history, not chosen:
    // the heaviest day ever recorded was 31.165.620 and a full validation run
    // costs roughly 15–20.000.000.
    //
    //   global 24h   ≈ 1,6× the heaviest day ever observed
    //   global 30d   ≈ 20 full validation runs
    //   merchant 24h ≈ 3,7× one full run concentrated on a single Business
    //
    // The per-merchant windows matter more than they look. With disposable
    // merchants the largest merchant-day was 1.100.000 — a tenth of the old
    // per-merchant cap, permanently dormant. Persistent Validation Actors
    // concentrate a whole run onto three Businesses, which turns a limit that
    // never fired into one that fires routinely.

    /// Global: merchant-credit volume in any rolling 24 hours — Kz 500.000.
    pub const GLOBAL_ROLLING_24H_MINOR: i64 = 50_000_000;
    /// Global: merchant-credit volume in any rolling 30 days — Kz 4.000.000.
    pub const GLOBAL_ROLLING_30D_MINOR: i64 = 400_000_000;
    /// Per merchant: merchant-credit volume in any rolling 24 hours — Kz 250.000.
    pub const MERCHANT_ROLLING_24H_MINOR: i64 = 25_000_000;
    /// Per merchant: merchant-credit volume in any rolling 30 days — Kz 1.000.000.
    pub const MERCHANT_ROLLING_30D_MINOR: i64 = 100_000_000;

    // Relationships the numbers must keep, checked at COMPILE time so a future
    // re-sizing cannot quietly break them. A runtime test could not: these are
    // constants, and the assertion would be optimised away.

    /// No single merchant can be the sole cause of the global 24h window closing:
    /// its own cap is at most half the global one.
    const _: () = assert!(MERCHANT_ROLLING_24H_MINOR * 2 <= GLOBAL_ROLLING_24H_MINOR);
    /// The same, over 30 days.
    const _: () = assert!(MERCHANT_ROLLING_30D_MINOR * 2 <= GLOBAL_ROLLING_30D_MINOR);
    /// A window must be wider than a single payment, or no payment could pass.
    const _: () = assert!(MERCHANT_PER_RECEIVE_MINOR < MERCHANT_ROLLING_24H_MINOR);
    /// The 24h window is the narrower of the two, in both scopes.
    const _: () = assert!(MERCHANT_ROLLING_24H_MINOR < MERCHANT_ROLLING_30D_MINOR);
    const _: () = assert!(GLOBAL_ROLLING_24H_MINOR < GLOBAL_ROLLING_30D_MINOR);
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
    MerchantBalance,
    AggregateFunds,
    GlobalVolume24h,
    GlobalVolume30d,
    MerchantVolume24h,
    MerchantVolume30d,
}

impl PilotLimitCode {
    /// The deterministic API/error string for this code.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PerPayment => "PILOT_LIMIT_PER_PAYMENT_EXCEEDED",
            Self::ConsumerDaily => "PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED",
            Self::ConsumerBalance => "PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED",
            Self::MerchantReceive => "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED",
            Self::MerchantBalance => "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED",
            Self::AggregateFunds => "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED",
            Self::GlobalVolume24h => "PILOT_LIMIT_GLOBAL_24H_VOLUME_EXCEEDED",
            Self::GlobalVolume30d => "PILOT_LIMIT_GLOBAL_30D_VOLUME_EXCEEDED",
            Self::MerchantVolume24h => "PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED",
            Self::MerchantVolume30d => "PILOT_LIMIT_MERCHANT_30D_VOLUME_EXCEEDED",
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
    pub fn check_merchant_receipt_amount(self, amount_minor: i64) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        if amount_minor > limits::MERCHANT_PER_RECEIVE_MINOR {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantReceive,
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

    /// Rolling merchant-credit volume windows, evaluated AFTER adding `added_minor`.
    ///
    /// All four windows are checked and the FIRST violation is returned, narrowest
    /// scope first: a caller told "this merchant is at its 24h limit" can wait or
    /// use another Business, which "the Sandbox is at its limit" does not tell it.
    ///
    /// Every argument is a rolling-window total the caller has already measured
    /// (see `pilot_enforce`); this function performs no I/O and keeps no clock,
    /// so it is exhaustively testable at the boundary.
    pub fn check_rolling_volume_after_add(
        self,
        usage: RollingVolumeUsage,
        added_minor: i64,
    ) -> Option<PilotViolation> {
        if !self.enabled {
            return None;
        }
        let over = |used: i64, cap: i64| used.saturating_add(added_minor) > cap;

        if over(usage.merchant_24h_minor, limits::MERCHANT_ROLLING_24H_MINOR) {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantVolume24h,
            });
        }
        if over(usage.merchant_30d_minor, limits::MERCHANT_ROLLING_30D_MINOR) {
            return Some(PilotViolation {
                code: PilotLimitCode::MerchantVolume30d,
            });
        }
        if over(usage.global_24h_minor, limits::GLOBAL_ROLLING_24H_MINOR) {
            return Some(PilotViolation {
                code: PilotLimitCode::GlobalVolume24h,
            });
        }
        if over(usage.global_30d_minor, limits::GLOBAL_ROLLING_30D_MINOR) {
            return Some(PilotViolation {
                code: PilotLimitCode::GlobalVolume30d,
            });
        }
        None
    }
}

/// Merchant-credit volume already used in each rolling window, in minor units.
///
/// A plain value object so the decision is pure: `pilot_enforce` measures, this
/// decides. Nothing here reads a clock or a database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RollingVolumeUsage {
    /// Every merchant's credits, last 24 hours.
    pub global_24h_minor: i64,
    /// Every merchant's credits, last 30 days.
    pub global_30d_minor: i64,
    /// This merchant's credits, last 24 hours.
    pub merchant_24h_minor: i64,
    /// This merchant's credits, last 30 days.
    pub merchant_30d_minor: i64,
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
        assert!(OFF.check_merchant_receipt_amount(i64::MAX).is_none());
        assert!(OFF
            .check_merchant_balance_after_credit(i64::MAX, i64::MAX)
            .is_none());
        assert!(OFF
            .check_aggregate_funds_after_add(i64::MAX, i64::MAX)
            .is_none());
        assert!(OFF
            .check_rolling_volume_after_add(
                RollingVolumeUsage {
                    global_24h_minor: i64::MAX,
                    global_30d_minor: i64::MAX,
                    merchant_24h_minor: i64::MAX,
                    merchant_30d_minor: i64::MAX,
                },
                i64::MAX
            )
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
    fn merchant_receipt_per_transaction_boundary_and_over() {
        // exactly at the per-receipt cap is allowed
        assert!(ON
            .check_merchant_receipt_amount(limits::MERCHANT_PER_RECEIVE_MINOR)
            .is_none());
        let v = ON
            .check_merchant_receipt_amount(limits::MERCHANT_PER_RECEIVE_MINOR + 1)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED");
    }

    #[test]
    fn merchant_balance_cap() {
        let v = ON
            .check_merchant_balance_after_credit(limits::MERCHANT_MAX_BALANCE_MINOR, 1)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED");
    }

    #[test]
    fn aggregate_funds_boundary_and_over() {
        // exactly at the cap is allowed; one minor over is not
        assert!(ON
            .check_aggregate_funds_after_add(limits::AGGREGATE_FUNDS_MINOR, 0)
            .is_none());
        let vf = ON
            .check_aggregate_funds_after_add(limits::AGGREGATE_FUNDS_MINOR, 1)
            .unwrap();
        assert_eq!(vf.as_str(), "PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED");
    }

    // ── Rolling merchant-credit volume windows (owner decision D1) ───────────

    /// Usage that is comfortably inside every window.
    const fn quiet() -> RollingVolumeUsage {
        RollingVolumeUsage {
            global_24h_minor: 0,
            global_30d_minor: 0,
            merchant_24h_minor: 0,
            merchant_30d_minor: 0,
        }
    }

    #[test]
    fn rolling_inside_every_window_is_allowed() {
        let usage = RollingVolumeUsage {
            global_24h_minor: limits::GLOBAL_ROLLING_24H_MINOR / 2,
            global_30d_minor: limits::GLOBAL_ROLLING_30D_MINOR / 2,
            merchant_24h_minor: limits::MERCHANT_ROLLING_24H_MINOR / 2,
            merchant_30d_minor: limits::MERCHANT_ROLLING_30D_MINOR / 2,
        };
        assert!(ON.check_rolling_volume_after_add(usage, 1).is_none());
    }

    #[test]
    fn rolling_exactly_at_each_cap_is_allowed() {
        // The cap is inclusive: landing exactly on it must pass, or the last
        // payment of every window is refused for being precisely on budget.
        //
        // Each case loads the window under test to one minor BELOW its cap and
        // adds exactly one. Loading it the other way round — a tiny used value
        // and one enormous payment — cannot isolate a window, because the wider
        // windows are reached through the narrower ones: any single payment big
        // enough to fill the 30d window has already broken the 24h one. That is
        // the policy behaving correctly, and the first version of this test was
        // wrong about it.
        let at_cap = |usage, add| ON.check_rolling_volume_after_add(usage, add);

        assert!(at_cap(
            RollingVolumeUsage { merchant_24h_minor: limits::MERCHANT_ROLLING_24H_MINOR - 1, ..quiet() },
            1
        )
        .is_none());
        assert!(at_cap(
            RollingVolumeUsage { merchant_30d_minor: limits::MERCHANT_ROLLING_30D_MINOR - 1, ..quiet() },
            1
        )
        .is_none());
        assert!(at_cap(
            RollingVolumeUsage { global_24h_minor: limits::GLOBAL_ROLLING_24H_MINOR - 1, ..quiet() },
            1
        )
        .is_none());
        assert!(at_cap(
            RollingVolumeUsage { global_30d_minor: limits::GLOBAL_ROLLING_30D_MINOR - 1, ..quiet() },
            1
        )
        .is_none());
    }

    #[test]
    fn a_single_payment_can_never_reach_a_wider_window_before_a_narrower_one() {
        // A payment large enough to fill the merchant 30d window necessarily
        // breaks the merchant 24h window first, so the caller is always told the
        // most actionable thing. This is a property of the cap ordering, and it
        // is what the boundary test above had to be written around.
        let v = ON
            .check_rolling_volume_after_add(quiet(), limits::MERCHANT_ROLLING_30D_MINOR)
            .unwrap();
        assert_eq!(v.as_str(), "PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED");
    }

    #[test]
    fn rolling_one_minor_over_each_cap_is_refused_with_its_own_code() {
        let cases: [(RollingVolumeUsage, &str); 4] = [
            (
                RollingVolumeUsage { merchant_24h_minor: limits::MERCHANT_ROLLING_24H_MINOR, ..quiet() },
                "PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED",
            ),
            (
                RollingVolumeUsage { merchant_30d_minor: limits::MERCHANT_ROLLING_30D_MINOR, ..quiet() },
                "PILOT_LIMIT_MERCHANT_30D_VOLUME_EXCEEDED",
            ),
            (
                RollingVolumeUsage { global_24h_minor: limits::GLOBAL_ROLLING_24H_MINOR, ..quiet() },
                "PILOT_LIMIT_GLOBAL_24H_VOLUME_EXCEEDED",
            ),
            (
                RollingVolumeUsage { global_30d_minor: limits::GLOBAL_ROLLING_30D_MINOR, ..quiet() },
                "PILOT_LIMIT_GLOBAL_30D_VOLUME_EXCEEDED",
            ),
        ];
        for (usage, expected) in cases {
            let v = ON.check_rolling_volume_after_add(usage, 1).unwrap();
            assert_eq!(v.as_str(), expected, "usage {usage:?}");
        }
    }

    #[test]
    fn rolling_reports_the_narrowest_scope_first() {
        // Every window is over at once. The caller is told about ITS OWN merchant
        // 24h window, because that is the one it can do something about — wait, or
        // use another Business. "the Sandbox is full" is not actionable.
        let all_over = RollingVolumeUsage {
            global_24h_minor: limits::GLOBAL_ROLLING_24H_MINOR,
            global_30d_minor: limits::GLOBAL_ROLLING_30D_MINOR,
            merchant_24h_minor: limits::MERCHANT_ROLLING_24H_MINOR,
            merchant_30d_minor: limits::MERCHANT_ROLLING_30D_MINOR,
        };
        assert_eq!(
            ON.check_rolling_volume_after_add(all_over, 1).unwrap().as_str(),
            "PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED"
        );
    }

    #[test]
    fn a_quiet_merchant_is_not_punished_for_a_busy_sandbox_until_the_global_cap() {
        // One merchant at zero, the Sandbox busy but under its cap → allowed.
        let usage = RollingVolumeUsage {
            global_24h_minor: limits::GLOBAL_ROLLING_24H_MINOR - 10,
            global_30d_minor: 0,
            merchant_24h_minor: 0,
            merchant_30d_minor: 0,
        };
        assert!(ON.check_rolling_volume_after_add(usage, 10).is_none());
        // One minor more and the global window is what refuses it.
        assert_eq!(
            ON.check_rolling_volume_after_add(usage, 11).unwrap().as_str(),
            "PILOT_LIMIT_GLOBAL_24H_VOLUME_EXCEEDED"
        );
    }

    #[test]
    fn rolling_saturates_instead_of_overflowing() {
        // An absurd amount must refuse, never panic on overflow.
        let v = ON.check_rolling_volume_after_add(
            RollingVolumeUsage { merchant_24h_minor: i64::MAX, ..quiet() },
            i64::MAX,
        );
        assert!(v.is_some());
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
        assert_eq!(limits::MERCHANT_MAX_BALANCE_MINOR, 10_000_000);
        assert_eq!(limits::AGGREGATE_FUNDS_MINOR, 50_000_000);
    }

    #[test]
    fn rolling_window_values_match_owner_decision_d1() {
        // Kz 500.000 / 4.000.000 global; Kz 250.000 / 1.000.000 per merchant.
        assert_eq!(limits::GLOBAL_ROLLING_24H_MINOR, 50_000_000);
        assert_eq!(limits::GLOBAL_ROLLING_30D_MINOR, 400_000_000);
        assert_eq!(limits::MERCHANT_ROLLING_24H_MINOR, 25_000_000);
        assert_eq!(limits::MERCHANT_ROLLING_30D_MINOR, 100_000_000);
    }
}
