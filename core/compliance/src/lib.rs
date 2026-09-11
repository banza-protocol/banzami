pub mod engine;
pub mod pilot;
pub mod pilot_enforce;
pub mod provider;
pub mod providers;
pub mod repository;
pub mod verification;

pub use engine::{ComplianceEngine, PostgresComplianceEngine};
pub use provider::{
    CustomerVerificationRequest, IdDocumentType, KycProvider, KycProviderError,
    MerchantVerificationRequest, VerificationDecision, VerificationOutcome,
};
pub use providers::{ExternalKycProvider, KycProviderKind, SimulatedKycProvider};
pub use repository::{ComplianceRepository, MerchantDecision, PostgresComplianceRepository};
pub use verification::VerificationRecordStatus;

use chrono::{DateTime, Utc};
use thiserror::Error;

use banzami_types::{CustomerId, MerchantId};

// ---------------------------------------------------------------------------
// KYC / KYB levels and statuses
// ---------------------------------------------------------------------------

/// Customer identity verification level.
/// Levels are ordered: higher levels grant more transaction capacity.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
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
            Self::None => "NONE",
            Self::Basic => "BASIC",
            Self::Enhanced => "ENHANCED",
            Self::Full => "FULL",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "NONE" => Some(Self::None),
            "BASIC" => Some(Self::Basic),
            "ENHANCED" => Some(Self::Enhanced),
            "FULL" => Some(Self::Full),
            _ => None,
        }
    }

    /// Maximum single-transaction amount this KYC level permits (0 = blocked).
    pub const fn max_single_transaction_minor(self) -> i64 {
        match self {
            Self::None => 0,
            Self::Basic => 5_000_000,     // 50,000 AOA
            Self::Enhanced => 50_000_000, // 500,000 AOA
            Self::Full => i64::MAX,
        }
    }

    /// Maximum daily transaction volume this KYC level permits (0 = blocked).
    pub const fn max_daily_volume_minor(self) -> i64 {
        match self {
            Self::None => 0,
            Self::Basic => 50_000_000,     // 500,000 AOA
            Self::Enhanced => 500_000_000, // 5,000,000 AOA
            Self::Full => i64::MAX,
        }
    }

    /// Progressive level number (0–3), exposed to clients as `KYC_LEVEL_N`.
    /// None=0 (account only), Basic=1 (basic identity), Enhanced=2 (document
    /// verified), Full=3 (enhanced KYC).
    pub const fn level_number(self) -> u8 {
        match self {
            Self::None => 0,
            Self::Basic => 1,
            Self::Enhanced => 2,
            Self::Full => 3,
        }
    }

    /// Canonical API representation: `KYC_LEVEL_0` … `KYC_LEVEL_3`.
    pub const fn as_api_level(self) -> &'static str {
        match self {
            Self::None => "KYC_LEVEL_0",
            Self::Basic => "KYC_LEVEL_1",
            Self::Enhanced => "KYC_LEVEL_2",
            Self::Full => "KYC_LEVEL_3",
        }
    }

    /// The next level up (Full is the ceiling).
    pub const fn next(self) -> KycLevel {
        match self {
            Self::None => Self::Basic,
            Self::Basic => Self::Enhanced,
            Self::Enhanced => Self::Full,
            Self::Full => Self::Full,
        }
    }

    /// Lowest level whose single + daily limits both accommodate `amount` given
    /// `daily_volume` already used today. Returns `Full` if none is sufficient.
    pub fn min_level_for_amount(amount: i64, daily_volume: i64) -> KycLevel {
        for lvl in [Self::Basic, Self::Enhanced, Self::Full] {
            if amount <= lvl.max_single_transaction_minor()
                && daily_volume + amount <= lvl.max_daily_volume_minor()
            {
                return lvl;
            }
        }
        Self::Full
    }
}

/// Cap on inbound value (receive / top-up) an unverified account (KYC_LEVEL_0)
/// may handle before basic identity is required. 100,000 AOA.
pub const UNVERIFIED_INBOUND_CAP_MINOR: i64 = 10_000_000;

/// The kind of financial operation being authorized. Different operations carry
/// different risk and therefore require different minimum KYC levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OperationType {
    Send,
    Receive,
    PayMerchant,
    CashOut,
    Withdrawal,
    Payout,
    TopUp,
}

impl OperationType {
    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "SEND" => Some(Self::Send),
            "RECEIVE" => Some(Self::Receive),
            "PAY_MERCHANT" => Some(Self::PayMerchant),
            "CASH_OUT" => Some(Self::CashOut),
            "WITHDRAWAL" => Some(Self::Withdrawal),
            "PAYOUT" => Some(Self::Payout),
            "TOP_UP" => Some(Self::TopUp),
            _ => None,
        }
    }

    /// Inbound operations add value to the wallet; they are lower risk and are
    /// allowed (capped) even before verification.
    pub const fn is_inbound(self) -> bool {
        matches!(self, Self::Receive | Self::TopUp)
    }

    /// Minimum KYC level required to perform this operation at all.
    /// - inbound (receive/top-up): allowed from KYC_LEVEL_0 (capped)
    /// - outbound spend (send/pay merchant): basic identity (KYC_LEVEL_1)
    /// - cash leaving the network (cash-out/withdrawal/payout): document
    ///   verified (KYC_LEVEL_2)
    pub const fn min_level(self) -> KycLevel {
        match self {
            Self::Receive | Self::TopUp => KycLevel::None,
            Self::Send | Self::PayMerchant => KycLevel::Basic,
            Self::CashOut | Self::Withdrawal | Self::Payout => KycLevel::Enhanced,
        }
    }
}

/// Structured result of a Progressive-KYC authorization check. Surfaced to the
/// API/SDK so clients can explain exactly why an operation is or isn't allowed.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransactionAuthorization {
    pub can_transact: bool,
    /// Machine code: `OK` | `KYC_REQUIRED` | `KYC_NOT_APPROVED` | `LIMIT_EXCEEDED`.
    pub reason: String,
    pub current_level: KycLevel,
    /// The level the customer must reach for this operation to succeed.
    pub required_level: Option<KycLevel>,
    /// Human-readable explanation.
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
            Self::Pending => "PENDING",
            Self::Approved => "APPROVED",
            Self::Rejected => "REJECTED",
            Self::UnderReview => "UNDER_REVIEW",
            Self::Suspended => "SUSPENDED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "PENDING" => Some(Self::Pending),
            "APPROVED" => Some(Self::Approved),
            "REJECTED" => Some(Self::Rejected),
            "UNDER_REVIEW" => Some(Self::UnderReview),
            "SUSPENDED" => Some(Self::Suspended),
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
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CustomerCompliance {
    pub customer_id: CustomerId,
    pub kyc_level: KycLevel,
    pub status: ComplianceStatus,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Compliance record for a merchant (business-side KYB + AML).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MerchantCompliance {
    pub merchant_id: MerchantId,
    /// Business identity verification status.
    pub kyb_status: ComplianceStatus,
    /// Anti-money-laundering screening status.
    pub aml_status: ComplianceStatus,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
    InsufficientKycLevel {
        required: KycLevel,
        current: KycLevel,
    },

    #[error("merchant compliance check failed: {reason}")]
    MerchantBlocked { reason: String },

    #[error("unknown status: {0}")]
    UnknownStatus(String),

    #[error("invalid identity document: {0}")]
    InvalidDocument(String),

    #[error("identity verification provider error: {0}")]
    ProviderError(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}
