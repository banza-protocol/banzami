//! Application Settlement (Banzami ADR-021 / BANZA ADR-039).
//!
//! The operator capability that lets an application settle accumulated NET value
//! to a beneficiary after a business event — decoupled in time from the payments
//! that funded it. It is **generic**: DOA, Mongo, marketplaces and crowdfunding
//! are all future consumers that differ only in *when* they call it; this crate
//! contains no app-specific logic.
//!
//! - The fee it may carry (the *application fee*) is the application's, not the
//!   operator's, and is resolved by the same [`banzami_pricing`] engine — so
//!   percentages still live only in `pricing_rules`, never hard-coded.
//! - On COMPLETED it writes its OWN balanced postings (ADR-002, append-only),
//!   never touching the earlier payment postings or the Operator Fee.

pub mod domain;
pub mod engine;
pub mod repository;

pub use domain::{
    ApplicationSettlement, ApplicationSettlementStatus, CreateApplicationSettlementRequest,
};
pub use engine::{ApplicationSettlementEngine, PostgresApplicationSettlementEngine};
pub use repository::{
    ApplicationSettlementFilter, ApplicationSettlementRepository,
    PostgresApplicationSettlementRepository,
};

use banzami_types::ApplicationSettlementId;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApplicationSettlementError {
    #[error("application settlement {0} not found")]
    NotFound(ApplicationSettlementId),

    #[error("gross amount must be positive")]
    InvalidAmount,

    #[error("currency mismatch in settlement accounts/amount")]
    CurrencyMismatch,

    #[error("resolved application fee {fee} exceeds gross {gross}")]
    FeeExceedsGross { fee: i64, gross: i64 },

    #[error(
        "an application fee of {fee} was resolved but no application_fee_account_id was given"
    )]
    MissingFeeAccount { fee: i64 },

    #[error("insufficient funds in source account: available {available}, required {required}")]
    InsufficientFunds { available: i64, required: i64 },

    #[error("invalid status transition: {from} -> {to}")]
    InvalidStatus { from: String, to: String },

    /// No pricing rule applies to this settlement.
    ///
    /// Deliberately its own variant rather than a `Pricing(String)`. It is a
    /// refusal caused by configuration — someone has to assign this owner a
    /// policy — while the other pricing failures are genuine internal faults.
    /// Collapsing the two makes a 500 out of a decision, which reads to the
    /// caller as "the operator is broken" and invites a retry that can never
    /// succeed.
    #[error("no pricing rule applies to this settlement")]
    PricingNotConfigured,

    /// More than one rule applies, and choosing between them would be guessing.
    ///
    /// Its own variant, and a REFUSAL, because the alternative is what the V1
    /// resolver did: rank candidates by counting non-null matchers and break
    /// ties by comparing UUIDs. Deterministic, and economically arbitrary. A
    /// financial tie is a configuration error someone has to resolve, not a
    /// choice for whichever identifier sorts first.
    #[error(
        "{candidates} pricing rules apply to this settlement — the configuration is ambiguous"
    )]
    PricingAmbiguous { candidates: usize },

    #[error("pricing error: {0}")]
    Pricing(String),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
