//! Payment Collections + PaymentIntent (BANZA ADR-036 / ADR-037), operator-side.
//!
//! Implements the canonical protocol concept exactly (no Banzami-specific
//! semantics). A Collection is a composite financial obligation that holds no
//! money and never posts to the ledger; each share settles via its own
//! PaymentIntent -> Transfer -> Ledger. This crate owns persistence + lifecycle +
//! rule invariants. Event emission and the live settlement hook live in the
//! `core/api` route layer.

pub mod domain;
pub mod engine;
pub mod repository;
pub mod rules;

pub use domain::{
    Collection, CollectionRule, CollectionShare, CollectionStatus, CreateCollectionRequest,
    CreateShareRequest, Divisibility, FixedShare, IntentStatus, PaymentIntent, PercentShare,
    ResolvedShare, SettlementOutcome, ShareStatus, Surface,
};
pub use engine::{CollectionEngine, PostgresCollectionEngine};
pub use repository::{CollectionRepository, PostgresCollectionRepository};

use banzami_types::{CollectionId, CollectionShareId, PaymentIntentId};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CollectionError {
    #[error("collection {0} not found")]
    NotFound(CollectionId),

    #[error("collection share {0} not found")]
    ShareNotFound(CollectionShareId),

    #[error("payment intent {0} not found")]
    IntentNotFound(PaymentIntentId),

    #[error("not the owner of this collection")]
    NotOwner,

    #[error("collection is immutable after OPEN (currency/rule/total cannot change)")]
    Immutable,

    #[error("invalid rule: {0}")]
    InvalidRule(String),

    #[error("amount_minor must be positive")]
    InvalidAmount,

    #[error("amount cannot be divided equally without a remainder (no silent rounding)")]
    Indivisible,

    #[error("shares sum {sum} does not equal total {total}")]
    SumMismatch { sum: i64, total: i64 },

    #[error("contribution {amount} is below the minimum {min}")]
    BelowMinimum { amount: i64, min: i64 },

    #[error("this rule does not accept ad-hoc shares")]
    ClosedRuleNoDynamicShares,

    #[error("invalid status transition: {0}")]
    InvalidStatus(String),

    #[error("expires_at must be in the future")]
    ExpiryInPast,

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
