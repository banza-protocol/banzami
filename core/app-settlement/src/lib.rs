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

    /// ADR-029: an app-defined fee rate exceeds the operator's safety bound.
    #[error("application_fee_bps {bps} exceeds the maximum allowed {max}")]
    FeeBpsOutOfBounds { bps: u32, max: u32 },

    #[error("insufficient funds in source account: available {available}, required {required}")]
    InsufficientFunds { available: i64, required: i64 },

    #[error("invalid status transition: {from} -> {to}")]
    InvalidStatus { from: String, to: String },

    #[error("pricing error: {0}")]
    Pricing(String),

    #[error("ledger error: {0}")]
    Ledger(#[from] banzami_ledger::LedgerError),

    #[error(transparent)]
    Money(#[from] banzami_types::MoneyError),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
