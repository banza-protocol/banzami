//! Operator Pricing Engine (Banzami ADR-021 / BANZA ADR-039).
//!
//! This crate is the ONE place in the whole stack where fee percentages and
//! pricing rules exist. The BANZA protocol carries only references
//! (`BusinessCategory`, `PricingProfile`, `FeePolicyRef`) and the resolved
//! `fee_minor`; the numbers behind them are operator policy and never leave here.
//!
//! - [`engine::resolve`] is pure and deterministic: `(rules, context) ->
//!   fee_minor + audit snapshot`. No clock, no I/O, no float.
//! - [`repository`] loads the operator's active rule set from the `pricing_rules`
//!   table (migration 0070) and hands it to the engine.
//!
//! This crate performs NO ledger work and holds NO money (ADR-002 untouched).
//! Increment 3 wires the resolved fee into the Operator-Fee ledger leg; this
//! increment delivers only the engine, models, config and tests.

pub mod domain;
pub mod engine;
pub mod repository;

pub use domain::{
    BusinessCategory, FeePolicyRef, FeeResolution, FeeSnapshot, PricingContext, PricingProfile,
    PricingRule, RoundingMode,
};
pub use engine::{resolve, ENGINE_VERSION};
pub use repository::{PostgresPricingRuleProvider, PricingRuleProvider};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum PricingError {
    #[error("invalid pricing configuration: {0}")]
    Config(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
