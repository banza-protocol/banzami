use chrono::{DateTime, Utc};

use banzami_types::MerchantId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MerchantStatus {
    Active,
    Suspended,
    Closed,
}

impl MerchantStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            MerchantStatus::Active => "ACTIVE",
            MerchantStatus::Suspended => "SUSPENDED",
            MerchantStatus::Closed => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE" => Some(MerchantStatus::Active),
            "SUSPENDED" => Some(MerchantStatus::Suspended),
            "CLOSED" => Some(MerchantStatus::Closed),
            _ => None,
        }
    }
}

/// ADR-028 operator taxonomy of Business Accounts. Operator-only; never a BANZA
/// protocol concept.
pub const BUSINESS_ACCOUNT_TYPES: &[&str] = &[
    "MERCHANT",
    "APPLICATION",
    "PLATFORM",
    "NGO",
    "MARKETPLACE",
    "DELIVERY",
    "OTHER",
];

/// Types permitted to be the destination of an APPLICATION FEE (an app taking a
/// cut of value it routes). Only true "application" business accounts may.
pub const APPLICATION_FEE_TYPES: &[&str] = &["APPLICATION", "PLATFORM"];

/// Whether `t` is a valid business account type.
pub fn is_valid_business_account_type(t: &str) -> bool {
    BUSINESS_ACCOUNT_TYPES.contains(&t)
}

/// Whether a business account of type `t` may receive an application fee.
pub fn allows_application_fee(t: &str) -> bool {
    APPLICATION_FEE_TYPES.contains(&t)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Merchant {
    pub id: MerchantId,
    pub name: String,
    pub email: String,
    pub status: MerchantStatus,
    pub verified: bool,
    /// ADR-028 operator taxonomy: MERCHANT (default) | APPLICATION | PLATFORM |
    /// NGO | MARKETPLACE | DELIVERY | OTHER. Operator-only, not a protocol field.
    pub business_account_type: String,
    /// The @handle this Business owns in `handle_registry`, when it has one —
    /// the public identity an operator recognises it by. Read-only here: a
    /// handle is assigned by the application lifecycle, never through this type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Merchant {
    pub fn is_active(&self) -> bool {
        self.status == MerchantStatus::Active
    }
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateMerchantRequest {
    pub name: String,
    pub email: String,
    /// ADR-028: optional declared business account type (defaults to MERCHANT).
    pub business_account_type: Option<String>,
}
