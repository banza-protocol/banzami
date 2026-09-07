//! The Pricing Engine (Banzami ADR-021 / BANZA ADR-039).
//!
//! `resolve` is a PURE function of `(rules, context)` — no clock (the effective
//! window matches against `context.as_of`), no randomness, no I/O, no global
//! state — so it is deterministic and idempotent: the same inputs always yield
//! the same `fee_minor` and the same snapshot. All arithmetic is integer minor
//! units via `i128` intermediates; no floating point ever touches money
//! (ADR-002 / §9.3).
//!
//! The engine performs NO ledger work and holds NO money. It returns a number
//! and an audit snapshot; a caller (the Operator-Fee leg, an Application
//! Settlement) decides what to do with it.

use crate::domain::{FeeResolution, FeeSnapshot, PricingContext, PricingRule, RoundingMode};

/// Bumped whenever the resolution algorithm changes in a way that could alter a
/// previously-computed fee. Stored in every snapshot for forensic replay.
pub const ENGINE_VERSION: u32 = 1;

const BPS_DENOMINATOR: i128 = 10_000;

/// Apply a basis-point rate to an amount, in integer minor units, with the given
/// deterministic rounding. `i128` intermediates make overflow impossible for any
/// realistic amount (i64 amount * u32 bps fits easily).
///
/// Returns 0 for non-positive amounts — a fee is only ever charged on value that
/// actually moves.
fn apply_bps(amount_minor: i64, rate_bps: u32, rounding: RoundingMode) -> i64 {
    if amount_minor <= 0 || rate_bps == 0 {
        return 0;
    }
    let numerator = (amount_minor as i128) * (rate_bps as i128);
    let quotient = numerator / BPS_DENOMINATOR;
    let remainder = numerator % BPS_DENOMINATOR; // always >= 0 here (both operands >= 0)

    let rounded = match rounding {
        RoundingMode::Floor => quotient,
        RoundingMode::Ceil => {
            if remainder != 0 {
                quotient + 1
            } else {
                quotient
            }
        }
        RoundingMode::HalfUp => {
            if remainder * 2 >= BPS_DENOMINATOR {
                quotient + 1
            } else {
                quotient
            }
        }
        RoundingMode::HalfEven => {
            let twice = remainder * 2;
            // round up when over the half, or exactly on the half with an odd
            // quotient (ties go to the even neighbour); otherwise round down.
            if twice > BPS_DENOMINATOR || (twice == BPS_DENOMINATOR && quotient % 2 != 0) {
                quotient + 1
            } else {
                quotient
            }
        }
    };
    rounded as i64
}

/// True when every present matcher on the rule equals the corresponding context
/// value. A `None` matcher is a wildcard. A matcher that requires a dimension the
/// context did not supply (e.g. rule wants a profile but the context has none)
/// does NOT match.
fn rule_matches(rule: &PricingRule, ctx: &PricingContext) -> bool {
    // effective window: [effective_from, effective_to)
    if ctx.as_of < rule.effective_from {
        return false;
    }
    if let Some(to) = rule.effective_to {
        if ctx.as_of >= to {
            return false;
        }
    }

    if let Some(cat) = &rule.business_category {
        if cat != &ctx.business_category {
            return false;
        }
    }
    if let Some(profile) = &rule.pricing_profile {
        match &ctx.pricing_profile {
            Some(p) if p == profile => {}
            _ => return false,
        }
    }
    if let Some(policy) = &rule.fee_policy_ref {
        match &ctx.fee_policy_ref {
            Some(r) if &r.ref_ == policy => {}
            _ => return false,
        }
    }
    if let Some(cur) = rule.currency {
        if cur != ctx.currency {
            return false;
        }
    }
    if let Some(country) = &rule.country {
        match &ctx.country {
            Some(c) if c == country => {}
            _ => return false,
        }
    }
    if let Some(tx) = &rule.transaction_type {
        match &ctx.transaction_type {
            Some(t) if t == tx => {}
            _ => return false,
        }
    }
    true
}

/// Pick the winning rule: highest specificity, then highest `priority`, then
/// highest `version`. The final tiebreak is the rule id, so selection is total
/// and deterministic even for otherwise-identical rules.
fn select_rule<'a>(rules: &'a [PricingRule], ctx: &PricingContext) -> Option<&'a PricingRule> {
    rules
        .iter()
        .filter(|r| rule_matches(r, ctx))
        .max_by(|a, b| {
            a.specificity()
                .cmp(&b.specificity())
                .then(a.priority.cmp(&b.priority))
                .then(a.version.cmp(&b.version))
                .then(a.id.as_uuid().cmp(&b.id.as_uuid()))
        })
}

/// Resolve the fee for `ctx` against `rules`.
///
/// When no rule matches, this returns a fee of **0** with `rule_id = None`.
///
/// **That zero is a sentinel, not a policy.** It means "no decision was found",
/// and it is numerically identical to a rule that decides zero — which is why
/// callers MUST branch on `snapshot.rule_id` rather than on `fee_minor`. A
/// caller that only looks at the amount cannot tell an operator policy of free
/// from nobody having configured anything, and will post a free transaction
/// either way.
///
/// This doc used to call the no-match case a "safe default" and say the caller
/// "still posts a balanced, fee-less entry". Balanced, yes. Safe, no: it is the
/// sentence the rest of the codebase learned the behaviour from, and both the
/// capture and settlement paths implemented it faithfully. Both now refuse when
/// `rule_id` is `None` — see `TransactionError::PricingNotConfigured` and
/// `ApplicationSettlementError::PricingNotConfigured`.
///
/// The sentinel stays here rather than becoming an `Option`, because pure
/// resolution genuinely has no opinion about what an absent decision should
/// cost. Deciding that is the money-moving caller's job, and each one now does.
/// Why a V2 resolution produced no fee.
///
/// The whole point of V2 is that these are different facts. Before it, all
/// three collapsed into "fee 0 with no rule id", and every money-moving caller
/// had to re-derive the distinction from a sentinel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PricingFailure {
    /// The caller did not say which operation it was pricing. A caller that
    /// cannot name what it is charging for must not be given a number.
    OperationNotSpecified,
    /// No rule applies. Someone has to configure one; this is not zero.
    NotConfigured,
    /// More than one rule applies, and choosing between them would be guessing.
    ///
    /// The V1 resolver ranked candidates by counting non-null matchers and broke
    /// ties by comparing UUIDs — deterministic, and economically arbitrary. A
    /// financial tie is a configuration error, not something to settle by
    /// which identifier sorts first.
    Ambiguous { candidates: usize },
}

/// Resolve the fee for a fee-bearing operation. **This is the V2 path.**
///
/// Deterministic by construction: a rule applies when it names this exact
/// operation, this exact profile, and its effective window contains `as_of`.
/// There is no ranking, no specificity, and no tiebreak, because there is
/// nothing to rank — the database carries a unique index on
/// `(environment, profile, operation)` among enabled open-ended rules, so more
/// than one applying is a broken configuration rather than a choice.
///
///   0 rules -> `NotConfigured`
///   1 rule  -> apply it
///  >1 rules -> `Ambiguous`, refused
///
/// Legacy rules — those with no operation — are deliberately NOT eligible.
/// Treating an operation-less rule as a wildcard is precisely the behaviour
/// being removed: it is what would make a fee-bearing operation introduced
/// tomorrow inherit today's rate without anyone deciding.
pub fn resolve_for_operation(
    rules: &[PricingRule],
    ctx: &PricingContext,
) -> Result<FeeResolution, PricingFailure> {
    let Some(operation) = ctx.operation else {
        return Err(PricingFailure::OperationNotSpecified);
    };

    let applicable: Vec<&PricingRule> = rules
        .iter()
        .filter(|r| r.operation == Some(operation))
        .filter(|r| match (&r.pricing_profile, &ctx.pricing_profile) {
            (Some(rule_profile), Some(ctx_profile)) => rule_profile == ctx_profile,
            // A rule with no profile prices every profile. That is legitimate
            // for an operation charged at one rate network-wide, which is what
            // the deployed withdrawal rate is.
            (None, _) => true,
            // A rule pinned to a profile cannot apply when the caller named no
            // profile — otherwise one owner's plan would price another's.
            (Some(_), None) => false,
        })
        .filter(|r| window_contains(r, ctx.as_of))
        .collect();

    match applicable.len() {
        0 => Err(PricingFailure::NotConfigured),
        1 => Ok(apply_rule(applicable[0], ctx)),
        n => Err(PricingFailure::Ambiguous { candidates: n }),
    }
}

fn window_contains(rule: &PricingRule, as_of: chrono::DateTime<chrono::Utc>) -> bool {
    rule.effective_from <= as_of && rule.effective_to.is_none_or(|to| as_of < to)
}

/// Compute the fee a rule produces for a context, and snapshot the decision.
///
/// ONE implementation, shared by both resolution paths. The V1 `resolve` and
/// the V2 `resolve_for_operation` differ in how they CHOOSE a rule and in
/// nothing else — extracting this is what makes that true rather than
/// aspirational. A second copy is how "one rate and one base give one
/// deterministic fee" quietly stops holding.
fn apply_rule(rule: &PricingRule, ctx: &PricingContext) -> FeeResolution {
    let pct = apply_bps(ctx.amount_minor, rule.rate_bps, rule.rounding);
    // A flat component applies only to value that actually moves.
    let flat = if ctx.amount_minor > 0 {
        rule.flat_minor
    } else {
        0
    };
    let mut fee = pct.saturating_add(flat);

    if let Some(min) = rule.min_fee_minor {
        if fee < min {
            fee = min;
        }
    }
    if let Some(max) = rule.max_fee_minor {
        if fee > max {
            fee = max;
        }
    }
    if fee < 0 {
        fee = 0;
    }

    snapshot_of(
        ctx,
        fee,
        Some(rule),
        rule.rate_bps,
        rule.flat_minor,
        rule.min_fee_minor,
        rule.max_fee_minor,
        rule.rounding,
    )
}

#[allow(clippy::too_many_arguments)]
fn snapshot_of(
    ctx: &PricingContext,
    fee_minor: i64,
    rule: Option<&PricingRule>,
    rate_bps: u32,
    flat_minor: i64,
    min_fee_minor: Option<i64>,
    max_fee_minor: Option<i64>,
    rounding: RoundingMode,
) -> FeeResolution {
    let snapshot = FeeSnapshot {
        engine_version: ENGINE_VERSION,
        rule_id: rule.map(|r| r.id),
        rule_key: rule.map(|r| r.key.clone()),
        rule_version: rule.map(|r| r.version),
        business_category: ctx.business_category.as_str().to_string(),
        pricing_profile: ctx.pricing_profile.as_ref().map(|p| p.as_str().to_string()),
        fee_policy_ref: ctx.fee_policy_ref.as_ref().map(|r| r.ref_.clone()),
        currency: ctx.currency.code().to_string(),
        country: ctx.country.clone(),
        amount_minor: ctx.amount_minor,
        rate_bps,
        flat_minor,
        min_fee_minor,
        max_fee_minor,
        rounding,
        fee_minor,
        resolved_at: ctx.as_of,
    };
    FeeResolution {
        fee_minor,
        snapshot,
    }
}

pub fn resolve(rules: &[PricingRule], ctx: &PricingContext) -> FeeResolution {
    let echoed = |fee_minor: i64,
                  rule: Option<&PricingRule>,
                  rate_bps: u32,
                  flat_minor: i64,
                  min_fee_minor: Option<i64>,
                  max_fee_minor: Option<i64>,
                  rounding: RoundingMode|
     -> FeeResolution {
        let snapshot = FeeSnapshot {
            engine_version: ENGINE_VERSION,
            rule_id: rule.map(|r| r.id),
            rule_key: rule.map(|r| r.key.clone()),
            rule_version: rule.map(|r| r.version),
            business_category: ctx.business_category.as_str().to_string(),
            pricing_profile: ctx.pricing_profile.as_ref().map(|p| p.as_str().to_string()),
            fee_policy_ref: ctx.fee_policy_ref.as_ref().map(|r| r.ref_.clone()),
            currency: ctx.currency.code().to_string(),
            country: ctx.country.clone(),
            amount_minor: ctx.amount_minor,
            rate_bps,
            flat_minor,
            min_fee_minor,
            max_fee_minor,
            rounding,
            fee_minor,
            resolved_at: ctx.as_of,
        };
        FeeResolution {
            fee_minor,
            snapshot,
        }
    };

    let Some(rule) = select_rule(rules, ctx) else {
        // No decision found. `rule_id = None` in the snapshot is how the caller
        // is told that — NOT the 0, which a real rule can also produce. Callers
        // that move money refuse on this; see the doc comment above.
        return echoed(0, None, 0, 0, None, None, RoundingMode::Floor);
    };

    let pct = apply_bps(ctx.amount_minor, rule.rate_bps, rule.rounding);
    // flat applies only to value that actually moves
    let flat = if ctx.amount_minor > 0 {
        rule.flat_minor
    } else {
        0
    };
    let mut fee = pct.saturating_add(flat);

    if let Some(min) = rule.min_fee_minor {
        if fee < min {
            fee = min;
        }
    }
    if let Some(max) = rule.max_fee_minor {
        if fee > max {
            fee = max;
        }
    }
    // A fee is never negative.
    if fee < 0 {
        fee = 0;
    }

    echoed(
        fee,
        Some(rule),
        rule.rate_bps,
        rule.flat_minor,
        rule.min_fee_minor,
        rule.max_fee_minor,
        rule.rounding,
    )
}

#[cfg(test)]
// `5_000_00` etc. is intentional minor-unit money grouping (5000.00 Kz).
#[allow(clippy::inconsistent_digit_grouping)]
mod tests {
    use super::*;
    use crate::domain::{BusinessCategory, FeePolicyRef, PricingProfile, PricingRule};
    use banzami_types::{Currency, PricingRuleId};
    use chrono::{TimeZone, Utc};

    fn t(y: i32, mo: u32, d: u32) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, 12, 0, 0).unwrap()
    }

    /// Minimal rule builder — wildcards everywhere, no fee, open window.
    fn rule(key: &str) -> PricingRule {
        PricingRule {
            id: PricingRuleId::new(),
            key: key.to_string(),
            version: 1,
            business_category: None,
            pricing_profile: None,
            fee_policy_ref: None,
            currency: None,
            country: None,
            transaction_type: None,
            // The V1 test helpers build operation-less rules on purpose: they
            // exercise the legacy `resolve`, whose matching they still describe.
            // The V2 tests build their own rules that name an operation.
            operation: None,
            rate_bps: 0,
            flat_minor: 0,
            min_fee_minor: None,
            max_fee_minor: None,
            rounding: RoundingMode::HalfUp,
            priority: 0,
            effective_from: t(2020, 1, 1),
            effective_to: None,
        }
    }

    fn ctx(amount_minor: i64, cat: BusinessCategory) -> PricingContext {
        PricingContext {
            amount_minor,
            currency: Currency::AOA,
            business_category: cat,
            pricing_profile: None,
            fee_policy_ref: None,
            country: Some("AO".into()),
            transaction_type: None,
            operation: None,
            as_of: t(2026, 6, 29),
        }
    }

    // ---- transaction-type dimension (ADR-031) ---------------------------

    #[test]
    fn transaction_type_matcher_is_specific_and_scoped() {
        // A withdrawal rule (0.75%) matches ONLY a withdrawal context.
        let mut r = rule("wallet-withdrawal-standard");
        r.transaction_type = Some("wallet_withdrawal".into());
        r.rate_bps = 75;
        let rules = [r];

        let mut wdraw = ctx(100_000, BusinessCategory::P2p);
        wdraw.transaction_type = Some("wallet_withdrawal".into());
        assert_eq!(resolve(&rules, &wdraw).fee_minor, 750); // 0.75% of 100_000

        // No transaction type on the context → the specific rule does not match → free.
        let bare = ctx(100_000, BusinessCategory::P2p);
        assert_eq!(resolve(&rules, &bare).fee_minor, 0);

        // A different transaction type → no match → free.
        let mut other = ctx(100_000, BusinessCategory::P2p);
        other.transaction_type = Some("wallet_transfer".into());
        assert_eq!(resolve(&rules, &other).fee_minor, 0);
    }

    #[test]
    fn transaction_type_rule_outranks_a_wildcard() {
        // A tx-specific rule (0%) beats a generic catch-all (2%) by specificity.
        let mut generic = rule("catch-all");
        generic.rate_bps = 200;
        let mut free_transfer = rule("wallet-transfer-standard");
        free_transfer.transaction_type = Some("wallet_transfer".into());
        free_transfer.rate_bps = 0;

        let mut c = ctx(100_000, BusinessCategory::P2p);
        c.transaction_type = Some("wallet_transfer".into());
        assert_eq!(resolve(&[generic, free_transfer], &c).fee_minor, 0);
    }

    // ---- documented worked examples -------------------------------------

    #[test]
    fn donation_standard_resolves_configured_rule() {
        // DONATION / STANDARD -> 2% (200 bps)
        let mut r = rule("donation-standard");
        r.business_category = Some(BusinessCategory::Donation);
        r.pricing_profile = Some(PricingProfile::Standard);
        r.rate_bps = 200;
        let mut c = ctx(5_000_00, BusinessCategory::Donation); // 5000 Kz, profile required
        c.pricing_profile = Some(PricingProfile::Standard);

        let res = resolve(&[r.clone()], &c);
        // 500000 minor * 200 / 10000 = 10000 minor = 100.00 Kz
        assert_eq!(res.fee_minor, 100_00);
        assert_eq!(res.snapshot.rule_id, Some(r.id));
        assert_eq!(res.snapshot.rule_version, Some(1));
    }

    #[test]
    fn five_thousand_at_two_percent_is_one_hundred() {
        // "5000 Kz com 2% -> 100" (Kz, not minor) i.e. 5000_00 minor -> 100_00 minor
        let mut r = rule("flat2pct");
        r.rate_bps = 200;
        let res = resolve(&[r.clone()], &ctx(5_000_00, BusinessCategory::Ecommerce));
        assert_eq!(res.fee_minor, 100_00);
    }

    #[test]
    fn nine_hundred_ninety_nine_rounding_is_deterministic() {
        // 999 Kz = 999_00 minor @ 2% = 1_998_00 / 100... let's use a fractional case:
        // 99_900 minor @ 200 bps = 1_998_000 / 10_000 = 199.8 -> rounds by mode.
        let amount = 99_900; // 999.00 Kz
        let mk = |mode: RoundingMode| {
            let mut r = rule("r");
            r.rate_bps = 200;
            r.rounding = mode;
            resolve(&[r], &ctx(amount, BusinessCategory::Ecommerce)).fee_minor
        };
        // 99_900 * 200 / 10_000 = 1_998 exactly -> all modes agree.
        assert_eq!(mk(RoundingMode::Floor), 1_998);
        assert_eq!(mk(RoundingMode::HalfUp), 1_998);

        // a genuinely fractional case: 99_950 * 175 / 10_000 = 1_749.125
        let frac = |mode: RoundingMode| {
            let mut r = rule("r");
            r.rate_bps = 175;
            r.rounding = mode;
            resolve(&[r], &ctx(99_950, BusinessCategory::Ecommerce)).fee_minor
        };
        assert_eq!(frac(RoundingMode::Floor), 1_749); // .125 down
        assert_eq!(frac(RoundingMode::Ceil), 1_750); // .125 up
        assert_eq!(frac(RoundingMode::HalfUp), 1_749); // .125 < .5 -> down
    }

    #[test]
    fn half_up_ties_round_up_half_even_to_even() {
        // amount * bps / 10000 with remainder exactly 5000 (a half).
        // 25 * 200 = 5000; /10000 = 0.5 exactly.
        let mk = |amount: i64, mode: RoundingMode| {
            let mut r = rule("r");
            r.rate_bps = 200;
            r.rounding = mode;
            resolve(&[r], &ctx(amount, BusinessCategory::Ecommerce)).fee_minor
        };
        // 25 -> 0.5 : HalfUp=1, HalfEven=0 (0 is even), Floor=0, Ceil=1
        assert_eq!(mk(25, RoundingMode::HalfUp), 1);
        assert_eq!(mk(25, RoundingMode::HalfEven), 0);
        assert_eq!(mk(25, RoundingMode::Floor), 0);
        assert_eq!(mk(25, RoundingMode::Ceil), 1);
        // 75 -> 1.5 : HalfUp=2, HalfEven=2 (2 is even)
        assert_eq!(mk(75, RoundingMode::HalfUp), 2);
        assert_eq!(mk(75, RoundingMode::HalfEven), 2);
    }

    // ---- 200 bps boundary matrix ----------------------------------------

    /// The rate every Sandbox owner on `sandbox-donation-200` is charged, swept
    /// across every rounding boundary it has.
    ///
    /// At 200 bps the arithmetic is `amount * 200 / 10_000`, i.e. `amount / 50`,
    /// so the remainder cycles with period 50 and the exact half falls at
    /// `amount % 50 == 25`. Sweeping 1..=1000 covers twenty full cycles and
    /// therefore every boundary the rate can produce, twenty times over.
    ///
    /// The expectation is recomputed here with independent integer arithmetic
    /// rather than copied from the implementation: a test that reuses
    /// `apply_bps` would agree with a float bug instead of catching one.
    #[test]
    fn two_hundred_bps_boundary_matrix_is_exact_integer_arithmetic() {
        let fee = |amount: i64, mode: RoundingMode| {
            let mut r = rule("r");
            r.rate_bps = 200;
            r.rounding = mode;
            resolve(&[r], &ctx(amount, BusinessCategory::Donation)).fee_minor
        };

        let mut previous_half_up = 0;
        for amount in 1..=1_000i64 {
            let quotient = amount / 50;
            let remainder = amount % 50;

            assert_eq!(
                fee(amount, RoundingMode::Floor),
                quotient,
                "floor at {amount}"
            );
            assert_eq!(
                fee(amount, RoundingMode::Ceil),
                if remainder == 0 {
                    quotient
                } else {
                    quotient + 1
                },
                "ceil at {amount}"
            );
            // The half is at remainder 25 exactly, and HalfUp takes it upward.
            assert_eq!(
                fee(amount, RoundingMode::HalfUp),
                if remainder >= 25 {
                    quotient + 1
                } else {
                    quotient
                },
                "half-up at {amount}"
            );
            // Ties (remainder 25) go to the even neighbour; everything else
            // behaves like half-up.
            let half_even = if remainder > 25 || (remainder == 25 && quotient % 2 != 0) {
                quotient + 1
            } else {
                quotient
            };
            assert_eq!(
                fee(amount, RoundingMode::HalfEven),
                half_even,
                "half-even at {amount}"
            );

            // Invariants that must hold at every point, not just the boundaries.
            let charged = fee(amount, RoundingMode::HalfUp);
            assert!(charged <= amount, "fee {charged} exceeded amount {amount}");
            assert!(
                charged >= previous_half_up,
                "fee went DOWN as the amount went up: {amount}"
            );
            previous_half_up = charged;
        }
    }

    /// The brief's worked example, asserted as one case rather than inferred
    /// from the sweep: gross 100 000 at 200 bps is a fee of 2 000 and a net of
    /// 98 000, with no remainder to round.
    #[test]
    fn two_hundred_bps_on_one_hundred_thousand_is_exactly_two_thousand() {
        for mode in [
            RoundingMode::Floor,
            RoundingMode::Ceil,
            RoundingMode::HalfUp,
            RoundingMode::HalfEven,
        ] {
            let mut r = rule("r");
            r.rate_bps = 200;
            r.rounding = mode;
            let fee = resolve(&[r], &ctx(100_000, BusinessCategory::Donation)).fee_minor;
            assert_eq!(fee, 2_000, "100_000 @ 200bps under {mode:?}");
            assert_eq!(100_000 - fee, 98_000, "net under {mode:?}");
        }
    }

    /// A large amount must not overflow on the way to a small fee.
    ///
    /// `apply_bps` computes `amount * rate_bps` in i128 before dividing,
    /// precisely so this cannot wrap.
    ///
    /// `no_float_large_amount_does_not_overflow` below looks like it already
    /// covers this and does not: 9e12 × 9999 is about 9e16, which fits in an
    /// i64 with three orders of magnitude to spare, so that test passes
    /// unchanged if the intermediate is narrowed. This one uses i64::MAX / 2,
    /// where the product is about 9.2e20 and an i64 intermediate wraps — so it
    /// fails if the i128 is ever removed, which is the property being claimed.
    #[test]
    fn a_very_large_amount_does_not_overflow_the_intermediate() {
        let mut r = rule("r");
        r.rate_bps = 200;
        r.rounding = RoundingMode::Floor;
        let huge = i64::MAX / 2;
        let fee = resolve(&[r], &ctx(huge, BusinessCategory::Donation)).fee_minor;
        assert_eq!(fee, huge / 50, "200 bps of a very large amount");
        assert!(fee > 0 && fee < huge, "fee stayed positive and below gross");
    }

    // ---- zero-fee paths --------------------------------------------------

    #[test]
    fn ngo_and_government_can_resolve_zero() {
        // Explicit 0-bps rules for NGO/GOVERNMENT.
        let mut ngo = rule("ngo-free");
        ngo.business_category = Some(BusinessCategory::Ngo);
        ngo.rate_bps = 0;
        let mut gov = rule("gov-free");
        gov.business_category = Some(BusinessCategory::Government);
        gov.rate_bps = 0;
        let rules = [ngo, gov];

        assert_eq!(
            resolve(&rules, &ctx(1_000_00, BusinessCategory::Ngo)).fee_minor,
            0
        );
        assert_eq!(
            resolve(&rules, &ctx(1_000_00, BusinessCategory::Government)).fee_minor,
            0
        );
    }

    #[test]
    fn unknown_category_resolves_zero_with_null_rule() {
        let mut r = rule("ecom");
        r.business_category = Some(BusinessCategory::Ecommerce);
        r.rate_bps = 250;
        let res = resolve(
            &[r],
            &ctx(10_000_00, BusinessCategory::Other("SPACE_TOURISM".into())),
        );
        assert_eq!(res.fee_minor, 0);
        assert_eq!(res.snapshot.rule_id, None);
        assert_eq!(res.snapshot.business_category, "SPACE_TOURISM");
    }

    #[test]
    fn no_rules_at_all_is_zero() {
        let res = resolve(&[], &ctx(50_000_00, BusinessCategory::Marketplace));
        assert_eq!(res.fee_minor, 0);
        assert_eq!(res.snapshot.rule_id, None);
    }

    // ---- selection -------------------------------------------------------

    #[test]
    fn expired_rule_is_ignored() {
        let mut expired = rule("old");
        expired.business_category = Some(BusinessCategory::Donation);
        expired.rate_bps = 500;
        expired.effective_from = t(2020, 1, 1);
        expired.effective_to = Some(t(2025, 1, 1)); // ended before ctx.as_of (2026)
        let res = resolve(&[expired], &ctx(1_000_00, BusinessCategory::Donation));
        assert_eq!(res.fee_minor, 0, "expired rule must not apply");
        assert_eq!(res.snapshot.rule_id, None);
    }

    #[test]
    fn future_rule_is_ignored() {
        let mut future = rule("future");
        future.business_category = Some(BusinessCategory::Donation);
        future.rate_bps = 500;
        future.effective_from = t(2030, 1, 1);
        let res = resolve(&[future], &ctx(1_000_00, BusinessCategory::Donation));
        assert_eq!(res.fee_minor, 0);
    }

    #[test]
    fn most_specific_rule_wins() {
        // generic catch-all (1% on everything) vs specific DONATION/STANDARD (2%).
        let mut generic = rule("generic");
        generic.rate_bps = 100; // wildcard everything

        let mut specific = rule("donation-standard");
        specific.business_category = Some(BusinessCategory::Donation);
        specific.pricing_profile = Some(PricingProfile::Standard);
        specific.rate_bps = 200;

        let mut c = ctx(10_000_00, BusinessCategory::Donation);
        c.pricing_profile = Some(PricingProfile::Standard);

        let res = resolve(&[generic, specific.clone()], &c);
        assert_eq!(res.snapshot.rule_id, Some(specific.id));
        assert_eq!(res.fee_minor, 200_00); // 2% of 10000, not 1%
    }

    #[test]
    fn priority_breaks_specificity_ties() {
        // two equally specific rules; higher priority wins.
        let mut a = rule("a");
        a.business_category = Some(BusinessCategory::Donation);
        a.rate_bps = 300;
        a.priority = 1;
        let mut b = rule("b");
        b.business_category = Some(BusinessCategory::Donation);
        b.rate_bps = 200;
        b.priority = 5; // wins

        let res = resolve(&[a, b.clone()], &ctx(10_000_00, BusinessCategory::Donation));
        assert_eq!(res.snapshot.rule_id, Some(b.id));
        assert_eq!(res.fee_minor, 200_00);
    }

    #[test]
    fn fee_policy_ref_matches_when_present() {
        let mut r = rule("partner-policy");
        r.fee_policy_ref = Some("pol_partner_x".into());
        r.rate_bps = 150;
        let mut c = ctx(20_000_00, BusinessCategory::Marketplace);
        c.fee_policy_ref = Some(FeePolicyRef::new("pol_partner_x"));

        let res = resolve(&[r.clone()], &c);
        assert_eq!(res.snapshot.rule_id, Some(r.id));
        assert_eq!(res.fee_minor, 300_00); // 1.5% of 20000

        // different policy ref -> no match -> 0
        let mut c2 = c.clone();
        c2.fee_policy_ref = Some(FeePolicyRef::new("pol_other"));
        assert_eq!(resolve(&[r], &c2).fee_minor, 0);
    }

    // ---- components ------------------------------------------------------

    #[test]
    fn flat_plus_percentage_with_min_max_clamp() {
        let mut r = rule("composite");
        r.rate_bps = 100; // 1%
        r.flat_minor = 50; // + 0.50 Kz
        r.min_fee_minor = Some(200);
        r.max_fee_minor = Some(10_000);

        // 1% of 100_00 = 100, + 50 = 150, below min 200 -> 200
        assert_eq!(
            resolve(&[r.clone()], &ctx(100_00, BusinessCategory::Ecommerce)).fee_minor,
            200
        );
        // 1% of 50_000_00 = 50_000, +50 = 50_050, above max -> 10_000
        assert_eq!(
            resolve(&[r], &ctx(50_000_00, BusinessCategory::Ecommerce)).fee_minor,
            10_000
        );
    }

    #[test]
    fn zero_and_negative_amount_never_charge() {
        let mut r = rule("r");
        r.rate_bps = 500;
        r.flat_minor = 100;
        assert_eq!(
            resolve(&[r.clone()], &ctx(0, BusinessCategory::Ecommerce)).fee_minor,
            0
        );
        assert_eq!(
            resolve(&[r], &ctx(-100, BusinessCategory::Ecommerce)).fee_minor,
            0
        );
    }

    // ---- determinism / snapshot -----------------------------------------

    #[test]
    fn resolution_is_deterministic_and_idempotent() {
        let mut r = rule("donation-standard");
        r.business_category = Some(BusinessCategory::Donation);
        r.rate_bps = 200;
        let c = ctx(7_777_77, BusinessCategory::Donation);
        let a = resolve(std::slice::from_ref(&r), &c);
        let b = resolve(std::slice::from_ref(&r), &c);
        assert_eq!(a, b, "same inputs -> identical resolution");
    }

    #[test]
    fn snapshot_preserves_rule_version() {
        let mut r = rule("donation-standard");
        r.business_category = Some(BusinessCategory::Donation);
        r.rate_bps = 200;
        r.version = 7;
        let res = resolve(&[r.clone()], &ctx(1_000_00, BusinessCategory::Donation));
        assert_eq!(res.snapshot.rule_version, Some(7));
        assert_eq!(res.snapshot.rule_key.as_deref(), Some("donation-standard"));
        assert_eq!(res.snapshot.engine_version, ENGINE_VERSION);
        assert_eq!(res.snapshot.rate_bps, 200);
    }

    #[test]
    fn snapshot_round_trips_through_json() {
        let mut r = rule("donation-standard");
        r.business_category = Some(BusinessCategory::Donation);
        r.rate_bps = 200;
        let res = resolve(&[r], &ctx(1_234_56, BusinessCategory::Donation));
        let json = serde_json::to_string(&res.snapshot).unwrap();
        let back: FeeSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(res.snapshot, back);
    }

    #[test]
    fn no_float_large_amount_does_not_overflow() {
        // 9 trillion minor units * 9999 bps stays within i128.
        let mut r = rule("r");
        r.rate_bps = 9_999;
        let res = resolve(&[r], &ctx(9_000_000_000_000, BusinessCategory::Ecommerce));
        // 9e12 * 9999 / 10000 = 8_999_100_000_000
        assert_eq!(res.fee_minor, 8_999_100_000_000);
    }
}
