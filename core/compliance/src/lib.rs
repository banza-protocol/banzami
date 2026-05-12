use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{CustomerId, MerchantId};

/// KYC verification level for a customer or merchant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KycLevel {
    None,
    Basic,      // Name + phone verified
    Enhanced,   // ID document verified
    Full,       // ID + proof of address + face match
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ComplianceStatus {
    Pending,
    Approved,
    Rejected,
    UnderReview,
    Suspended,
}

/// Compliance record for a customer or business.
///
/// KYC/KYB checks must be completed before certain transaction limits are removed.
/// See the compliance runbook in docs/runbooks/ for level thresholds.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct CustomerCompliance {
    pub customer_id: CustomerId,
    pub kyc_level: KycLevel,
    pub status: ComplianceStatus,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MerchantCompliance {
    pub merchant_id: MerchantId,
    pub kyb_status: ComplianceStatus,
    pub aml_status: ComplianceStatus,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum ComplianceError {
    #[error("entity not found")]
    NotFound,

    #[error("KYC level insufficient: required {required:?}, current {current:?}")]
    InsufficientKycLevel { required: KycLevel, current: KycLevel },

    #[error("entity is suspended")]
    Suspended,
}
