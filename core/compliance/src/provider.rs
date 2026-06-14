//! Identity-verification provider abstraction (KYC / KYB).
//!
//! The compliance *engine* (`engine.rs`) owns the verification **state machine**
//! — levels, statuses, transaction gating. This module owns the seam to the
//! external party that actually **verifies an identity document**: it takes a
//! submitted identity (a consumer's Bilhete de Identidade, a merchant's NIF) and
//! returns a decision the engine then persists.
//!
//! Like the acquiring layer (`banzami-acquiring`), this is a trait with a
//! deterministic [`crate::providers::SimulatedKycProvider`] for development and
//! sandbox, and an [`crate::providers::ExternalKycProvider`] stub that is wired
//! to a real vendor in production. The provider is selected at startup via the
//! `KYC_PROVIDER` environment variable (default: `SIMULATED`).
//!
//! Banzami does not define *which* documents or levels exist — those are protocol
//! concepts consumed from BANZA. This module only models the operator-side
//! integration with a verification vendor.

use chrono::NaiveDate;
use thiserror::Error;

use banzami_types::{CustomerId, MerchantId};

use crate::KycLevel;

// ---------------------------------------------------------------------------
// Submitted identity documents
// ---------------------------------------------------------------------------

/// Type of identity document submitted for consumer verification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IdDocumentType {
    /// Angolan Bilhete de Identidade (national ID card).
    BilheteDeIdentidade,
    /// Passport (typically for foreign residents).
    Passport,
}

impl IdDocumentType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BilheteDeIdentidade => "BILHETE_DE_IDENTIDADE",
            Self::Passport => "PASSPORT",
        }
    }
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// A consumer identity submitted for KYC verification.
#[derive(Debug, Clone)]
pub struct CustomerVerificationRequest {
    pub customer_id: CustomerId,
    pub full_name: String,
    pub document_type: IdDocumentType,
    /// The document number as printed on the ID (e.g. `006887496LA042`).
    pub document_number: String,
    pub date_of_birth: NaiveDate,
    /// The KYC level the consumer is applying for. The provider may grant this
    /// level or a lower one; it never grants a higher level than requested.
    pub requested_level: KycLevel,
}

/// A merchant business identity submitted for KYB verification.
#[derive(Debug, Clone)]
pub struct MerchantVerificationRequest {
    pub merchant_id: MerchantId,
    /// Registered legal/business name.
    pub legal_name: String,
    /// Angolan NIF (Número de Identificação Fiscal).
    pub tax_id: String,
    /// Name of the legal representative submitting on behalf of the business.
    pub representative_name: String,
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

/// The provider's decision on a submitted identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VerificationDecision {
    /// Identity verified — grant the level / approve the business.
    Approved,
    /// Identity rejected — document invalid, mismatched, or failed screening.
    Rejected,
    /// Verification could not be completed automatically — route to manual review.
    PendingReview,
}

/// The result of a verification attempt.
#[derive(Debug, Clone)]
pub struct VerificationOutcome {
    pub decision: VerificationDecision,
    /// For consumer KYC: the level the provider is willing to grant on approval.
    /// Ignored for merchant KYB. Never higher than the requested level.
    pub granted_level: KycLevel,
    /// The provider's own reference for this verification (for audit / lookup).
    pub provider_reference: String,
    /// Human-readable reason, present for rejections and manual-review routing.
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum KycProviderError {
    /// The submitted document was structurally invalid (caller error, not vendor).
    #[error("invalid identity document: {0}")]
    InvalidDocument(String),

    /// The provider is unreachable, misconfigured, or returned an unexpected error.
    #[error("provider error: {0}")]
    Provider(String),
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait KycProvider: Send + Sync {
    /// Stable provider identifier recorded on the compliance audit trail.
    fn provider_name(&self) -> &'static str;

    /// Verify a consumer identity document (KYC).
    async fn verify_customer(
        &self,
        req: CustomerVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError>;

    /// Verify a merchant business identity (KYB).
    async fn verify_merchant(
        &self,
        req: MerchantVerificationRequest,
    ) -> Result<VerificationOutcome, KycProviderError>;
}
