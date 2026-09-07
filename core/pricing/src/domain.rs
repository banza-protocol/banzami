//! Pricing domain models (Banzami ADR-021 / BANZA ADR-039).
//!
//! These are OPERATOR concepts. The protocol (`~/banza`) knows only the
//! references (`BusinessCategory`, `PricingProfile`, `FeePolicyRef`) and the
//! resolved minor-unit result — never a percentage, table or rule. Everything in
//! this file that carries a number (`rate_bps`, `flat_minor`, …) is operator
//! policy and lives ONLY here.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use banzami_types::{Currency, PricingRuleId};

// ---------------------------------------------------------------------------
// Reference concepts (mirror ~/banza/contracts/fees/*.schema.json exactly).
// Open enums: the protocol marks BusinessCategory/PricingProfile `_extensible`,
// so an unknown value is carried verbatim. It then matches no rule, which the
// resolver reports as `rule_id = None` — and every money-moving caller refuses
// on that rather than charging nothing.
// ---------------------------------------------------------------------------

/// What kind of commerce a payment represents. Reference only — never a price.
/// Mirrors `contracts/fees/business-category.schema.json` (15 canonical values,
/// extensible).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum BusinessCategory {
    Donation,
    Crowdfunding,
    Marketplace,
    Ecommerce,
    Delivery,
    FoodDelivery,
    RideHailing,
    Subscription,
    Ticketing,
    DigitalGoods,
    PhysicalGoods,
    P2p,
    BillPayment,
    Ngo,
    Government,
    /// Forward-compatible: a category this operator build does not yet know.
    ///
    /// It matches no rule, so the resolver reports no decision. That is not a
    /// zero-fee default: capture and settlement refuse until a policy exists.
    /// Reading it as "free" was how an unknown category became the cheapest
    /// thing a caller could send.
    Other(String),
}

impl BusinessCategory {
    pub fn as_str(&self) -> &str {
        match self {
            BusinessCategory::Donation => "DONATION",
            BusinessCategory::Crowdfunding => "CROWDFUNDING",
            BusinessCategory::Marketplace => "MARKETPLACE",
            BusinessCategory::Ecommerce => "ECOMMERCE",
            BusinessCategory::Delivery => "DELIVERY",
            BusinessCategory::FoodDelivery => "FOOD_DELIVERY",
            BusinessCategory::RideHailing => "RIDE_HAILING",
            BusinessCategory::Subscription => "SUBSCRIPTION",
            BusinessCategory::Ticketing => "TICKETING",
            BusinessCategory::DigitalGoods => "DIGITAL_GOODS",
            BusinessCategory::PhysicalGoods => "PHYSICAL_GOODS",
            BusinessCategory::P2p => "P2P",
            BusinessCategory::BillPayment => "BILL_PAYMENT",
            BusinessCategory::Ngo => "NGO",
            BusinessCategory::Government => "GOVERNMENT",
            BusinessCategory::Other(s) => s,
        }
    }

    pub fn from_code(code: &str) -> Self {
        match code {
            "DONATION" => BusinessCategory::Donation,
            "CROWDFUNDING" => BusinessCategory::Crowdfunding,
            "MARKETPLACE" => BusinessCategory::Marketplace,
            "ECOMMERCE" => BusinessCategory::Ecommerce,
            "DELIVERY" => BusinessCategory::Delivery,
            "FOOD_DELIVERY" => BusinessCategory::FoodDelivery,
            "RIDE_HAILING" => BusinessCategory::RideHailing,
            "SUBSCRIPTION" => BusinessCategory::Subscription,
            "TICKETING" => BusinessCategory::Ticketing,
            "DIGITAL_GOODS" => BusinessCategory::DigitalGoods,
            "PHYSICAL_GOODS" => BusinessCategory::PhysicalGoods,
            "P2P" => BusinessCategory::P2p,
            "BILL_PAYMENT" => BusinessCategory::BillPayment,
            "NGO" => BusinessCategory::Ngo,
            "GOVERNMENT" => BusinessCategory::Government,
            other => BusinessCategory::Other(other.to_string()),
        }
    }
}

impl Serialize for BusinessCategory {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}
impl<'de> Deserialize<'de> for BusinessCategory {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::from_code(&String::deserialize(d)?))
    }
}

/// Commercial tier of the payee/application. Reference only.
/// Mirrors `contracts/fees/pricing-profile.schema.json`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PricingProfile {
    Standard,
    Business,
    Enterprise,
    Partner,
    Ngo,
    Government,
    Custom,
    Other(String),
}

impl PricingProfile {
    pub fn as_str(&self) -> &str {
        match self {
            PricingProfile::Standard => "STANDARD",
            PricingProfile::Business => "BUSINESS",
            PricingProfile::Enterprise => "ENTERPRISE",
            PricingProfile::Partner => "PARTNER",
            PricingProfile::Ngo => "NGO",
            PricingProfile::Government => "GOVERNMENT",
            PricingProfile::Custom => "CUSTOM",
            PricingProfile::Other(s) => s,
        }
    }

    pub fn from_code(code: &str) -> Self {
        match code {
            "STANDARD" => PricingProfile::Standard,
            "BUSINESS" => PricingProfile::Business,
            "ENTERPRISE" => PricingProfile::Enterprise,
            "PARTNER" => PricingProfile::Partner,
            "NGO" => PricingProfile::Ngo,
            "GOVERNMENT" => PricingProfile::Government,
            "CUSTOM" => PricingProfile::Custom,
            other => PricingProfile::Other(other.to_string()),
        }
    }
}

impl Serialize for PricingProfile {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}
impl<'de> Deserialize<'de> for PricingProfile {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::from_code(&String::deserialize(d)?))
    }
}

/// Opaque handle to a commercial fee policy. The protocol transports the string
/// and never interprets it; only the operator's Pricing Engine resolves it.
/// Mirrors `contracts/fees/fee-policy-ref.schema.json`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FeePolicyRef {
    pub ref_: String,
}

impl FeePolicyRef {
    pub fn new(handle: impl Into<String>) -> Self {
        Self {
            ref_: handle.into(),
        }
    }
}

// ---------------------------------------------------------------------------
// Resolution inputs/outputs
// ---------------------------------------------------------------------------

/// Everything the engine needs to resolve a fee. The engine reads ONLY this and
/// the rule set — it never reads the clock, the network or any global state, so
/// resolution is deterministic and idempotent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PricingContext {
    /// Gross amount the fee is computed on, in integer minor units. Never float.
    pub amount_minor: i64,
    pub currency: Currency,
    pub business_category: BusinessCategory,
    /// Optional commercial tier.
    pub pricing_profile: Option<PricingProfile>,
    /// Optional opaque policy handle.
    pub fee_policy_ref: Option<FeePolicyRef>,
    /// ISO 3166-1 alpha-2 country, e.g. "AO". Optional.
    pub country: Option<String>,
    /// Operator transaction-type label (e.g. "wallet_transfer", "merchant_payment",
    /// "wallet_withdrawal"). Reference only — never a price (ADR-031). Optional.
    ///
    /// LEGACY, superseded by `operation`. Kept so rules written before V2 keep
    /// resolving during the cutover.
    pub transaction_type: Option<String>,
    /// Which fee-bearing operation is being priced.
    ///
    /// A caller that does not say what it is charging for cannot be charged
    /// correctly, so `None` resolves nothing under the V2 path rather than
    /// matching everything. That is the whole difference between this and the
    /// dimension it replaces.
    pub operation: Option<PricingOperation>,
    /// The instant resolution is "as of" — caller-supplied so the result is
    /// reproducible. Drives the effective-window match; never `Utc::now()` inside
    /// the engine.
    pub as_of: DateTime<Utc>,
}

/// Deterministic rounding strategy for the percentage component. Stored in the
/// snapshot so a fee can always be re-derived exactly.
/// A fee-bearing economic operation — the thing a rate is *for*.
///
/// The audit's P0 was that the engine could not tell a settlement from a
/// capture: `transaction_type` was the only operation discriminator and only
/// the payout path set it, so a rule pinned to an operation could never match
/// either of the other two, and a rule that matched settlement necessarily also
/// matched capture. There was no way to write a settlement-only rate.
///
/// This is that missing dimension, and it is deliberately not `transaction_type`
/// reused. A transaction type describes a row in `transactions`. An operation
/// names an act the operator charges for. Conflating them produced a rule
/// requiring `transaction_type = "payment"` that has never matched anything.
///
/// The set is closed on purpose. Under the confirmed economic model these are
/// the only two fee-bearing operations:
///
///   - the generic transfer primitive is neutral, because it also carries P2P
///     and a fee inside it would charge people for sending money to each other
///   - a payment or donation credits the merchant wallet GROSS
///   - capture is leaving operator pricing entirely
///   - a refund reverses value that was already priced
///
/// Adding a variant here is an economic decision, not a refactor: it is a new
/// place this operator charges money, and the completeness gate is written so
/// that adding one without a policy fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PricingOperation {
    /// Settling accumulated value to a beneficiary.
    Settlement,
    /// A withdrawal — money leaving the network.
    Payout,
}

impl PricingOperation {
    pub fn as_str(self) -> &'static str {
        match self {
            PricingOperation::Settlement => "SETTLEMENT",
            PricingOperation::Payout => "PAYOUT",
        }
    }

    /// Parses the stored form. Unknown values are `None` rather than a
    /// fallback: a rule naming an operation this build does not know is a rule
    /// this build must not apply, and silently treating it as a wildcard is how
    /// an unrecognised policy becomes a free one.
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "SETTLEMENT" => Some(PricingOperation::Settlement),
            "PAYOUT" => Some(PricingOperation::Payout),
            _ => None,
        }
    }

    /// Every released fee-bearing operation. The completeness gate requires an
    /// explicit rule for each of these, per active profile.
    pub const RELEASED: [PricingOperation; 2] =
        [PricingOperation::Settlement, PricingOperation::Payout];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RoundingMode {
    /// Round to nearest; ties (exactly .5 of a minor unit) round up.
    HalfUp,
    /// Round to nearest; ties round to the even neighbour (banker's rounding).
    HalfEven,
    /// Truncate toward zero (never charge more than the exact share).
    Floor,
    /// Round away from zero (never charge less than the exact share).
    Ceil,
}

impl RoundingMode {
    pub fn as_str(self) -> &'static str {
        match self {
            RoundingMode::HalfUp => "HALF_UP",
            RoundingMode::HalfEven => "HALF_EVEN",
            RoundingMode::Floor => "FLOOR",
            RoundingMode::Ceil => "CEIL",
        }
    }
}

/// One operator pricing rule. A rule matches a context when every *present*
/// matcher equals the corresponding context value; a `None` matcher is a
/// wildcard. The fee is `flat_minor + round(amount_minor * rate_bps / 10_000)`
/// clamped to `[min_fee_minor, max_fee_minor]`.
///
/// `rate_bps` is the ONLY place a percentage exists (200 bps = 2%); it never
/// leaves the operator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PricingRule {
    pub id: PricingRuleId,
    /// Stable, human label, e.g. "donation-standard". For audit/ops only.
    pub key: String,
    /// Monotonic version of THIS rule key; preserved into the snapshot.
    pub version: i32,

    // --- matchers (None = wildcard) ---
    pub business_category: Option<BusinessCategory>,
    pub pricing_profile: Option<PricingProfile>,
    pub fee_policy_ref: Option<String>,
    pub currency: Option<Currency>,
    pub country: Option<String>,
    /// Operator transaction-type matcher (ADR-031). None = wildcard.
    ///
    /// LEGACY. Superseded by `operation` and kept only so rules written before
    /// V2 keep resolving during the cutover. Nothing new should set it: it
    /// describes a transaction row rather than an economic act, which is why it
    /// could never name a settlement.
    pub transaction_type: Option<String>,
    /// The fee-bearing operation this rule prices.
    ///
    /// `None` is legacy — a rule from before operations existed, which matches
    /// any operation and is exactly the wildcard V2 removes. Once every runtime
    /// rule names its operation, the resolver refuses the ones that do not.
    pub operation: Option<PricingOperation>,

    // --- fee components (operator policy) ---
    /// Percentage in basis points. 200 = 2.00%. May be 0.
    pub rate_bps: u32,
    /// Fixed component in minor units. May be 0.
    pub flat_minor: i64,
    /// Optional lower bound on the resolved fee (minor units).
    pub min_fee_minor: Option<i64>,
    /// Optional upper bound on the resolved fee (minor units).
    pub max_fee_minor: Option<i64>,
    pub rounding: RoundingMode,

    // --- selection + lifecycle ---
    /// Explicit tiebreak when two rules are equally specific. Higher wins.
    pub priority: i32,
    /// Inclusive lower bound of the effective window.
    pub effective_from: DateTime<Utc>,
    /// Exclusive upper bound; `None` = open-ended.
    pub effective_to: Option<DateTime<Utc>>,
}

impl PricingRule {
    /// Number of non-wildcard matchers — the rule's specificity. The most
    /// specific matching rule wins (`priority` breaks ties).
    pub fn specificity(&self) -> u8 {
        self.business_category.is_some() as u8
            + self.pricing_profile.is_some() as u8
            + self.fee_policy_ref.is_some() as u8
            + self.currency.is_some() as u8
            + self.country.is_some() as u8
            + self.transaction_type.is_some() as u8
    }
}

/// Immutable audit record of one resolution. Persisted alongside whatever the
/// fee funds (e.g. an `operator_fee` row) so the number is always reproducible
/// and attributable to an exact rule version. The protocol stores only
/// `fee_minor` + the references; this snapshot is operator-internal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeeSnapshot {
    /// Algorithm version of the engine that produced this snapshot.
    pub engine_version: u32,
    /// The rule that fired, or `None` when no rule matched (fee defaulted to 0).
    pub rule_id: Option<PricingRuleId>,
    pub rule_key: Option<String>,
    pub rule_version: Option<i32>,

    // resolved context (echoed for audit)
    pub business_category: String,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub currency: String,
    pub country: Option<String>,
    pub amount_minor: i64,

    // components actually applied
    pub rate_bps: u32,
    pub flat_minor: i64,
    pub min_fee_minor: Option<i64>,
    pub max_fee_minor: Option<i64>,
    pub rounding: RoundingMode,

    /// The resolved fee in integer minor units. Never float. May be 0.
    pub fee_minor: i64,
    /// The `as_of` the resolution was computed against.
    pub resolved_at: DateTime<Utc>,
}

/// The engine's return value: the fee and its full audit snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeeResolution {
    pub fee_minor: i64,
    pub snapshot: FeeSnapshot,
}
