pub mod engine;
pub mod repository;

pub use engine::{ComplianceEngine, PostgresComplianceEngine};
pub use repository::{ComplianceRepository, PostgresComplianceRepository};

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{CustomerId, MerchantId};

// ---------------------------------------------------------------------------
// KYC / KYB levels and statuses
// ---------------------------------------------------------------------------

/// Customer identity verification level.
/// Levels are ordered: higher levels grant more transaction capacity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KycLevel {
    None,
    /// Name + phone verified.
    Basic,
    /// Government ID document verified.
    Enhanced,
    /// ID + proof of address + face match.
    Full,
}

impl KycLevel {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None     => "NONE",
            Self::Basic    => "BASIC",
            Self::Enhanced => "ENHANCED",
            Self::Full     => "FULL",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "NONE"     => Some(Self::None),
            "BASIC"    => Some(Self::Basic),
            "ENHANCED" => Some(Self::Enhanced),
            "FULL"     => Some(Self::Full),
            _ => None,
        }
    }

    /// Maximum single-transaction amount this KYC level permits (0 = blocked).
    pub const fn max_single_transaction_minor(self) -> i64 {
        match self {
            Self::None     => 0,
            Self::Basic    => 50_000_00,    // 50,000 AOA
            Self::Enhanced => 500_000_00,   // 500,000 AOA
            Self::Full     => i64::MAX,
        }
    }

    /// Maximum daily transaction volume this KYC level permits (0 = blocked).
    pub const fn max_daily_volume_minor(self) -> i64 {
        match self {
            Self::None     => 0,
            Self::Basic    => 500_000_00,   // 500,000 AOA
            Self::Enhanced => 5_000_000_00, // 5,000,000 AOA
            Self::Full     => i64::MAX,
        }
    }
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

impl ComplianceStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending     => "PENDING",
            Self::Approved    => "APPROVED",
            Self::Rejected    => "REJECTED",
            Self::UnderReview => "UNDER_REVIEW",
            Self::Suspended   => "SUSPENDED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING"      => Some(Self::Pending),
            "APPROVED"     => Some(Self::Approved),
            "REJECTED"     => Some(Self::Rejected),
            "UNDER_REVIEW" => Some(Self::UnderReview),
            "SUSPENDED"    => Some(Self::Suspended),
            _ => None,
        }
    }

    pub const fn can_operate(self) -> bool {
        matches!(self, Self::Approved)
    }
}

// ---------------------------------------------------------------------------
// Compliance records
// ---------------------------------------------------------------------------

/// Compliance record for a customer (consumer-side KYC).
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct CustomerCompliance {
    pub customer_id:  CustomerId,
    pub kyc_level:    KycLevel,
    pub status:       ComplianceStatus,
    pub reviewed_at:  Option<DateTime<Utc>>,
    pub created_at:   DateTime<Utc>,
    pub updated_at:   DateTime<Utc>,
}

/// Compliance record for a merchant (business-side KYB + AML).
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MerchantCompliance {
    pub merchant_id:  MerchantId,
    /// Business identity verification status.
    pub kyb_status:   ComplianceStatus,
    /// Anti-money-laundering screening status.
    pub aml_status:   ComplianceStatus,
    pub reviewed_at:  Option<DateTime<Utc>>,
    pub notes:        Option<String>,
    pub created_at:   DateTime<Utc>,
    pub updated_at:   DateTime<Utc>,
}

impl MerchantCompliance {
    /// A merchant can process transactions only when both KYB and AML are Approved.
    pub fn can_process_transactions(&self) -> bool {
        self.kyb_status.can_operate() && self.aml_status.can_operate()
    }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ComplianceError {
    #[error("entity not found")]
    NotFound,

    #[error("KYC level insufficient: required {required:?}, current {current:?}")]
    InsufficientKycLevel { required: KycLevel, current: KycLevel },

    #[error("merchant compliance check failed: {reason}")]
    MerchantBlocked { reason: String },

    #[error("unknown status: {0}")]
    UnknownStatus(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
