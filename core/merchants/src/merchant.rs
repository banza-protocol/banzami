use chrono::{DateTime, Utc};

use banzami_types::MerchantId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MerchantStatus {
    Active,
    Suspended,
    Closed,
}

impl MerchantStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            MerchantStatus::Active    => "ACTIVE",
            MerchantStatus::Suspended => "SUSPENDED",
            MerchantStatus::Closed    => "CLOSED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE"    => Some(MerchantStatus::Active),
            "SUSPENDED" => Some(MerchantStatus::Suspended),
            "CLOSED"    => Some(MerchantStatus::Closed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Merchant {
    pub id:         MerchantId,
    pub name:       String,
    pub email:      String,
    pub status:     MerchantStatus,
    pub verified:   bool,
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
    pub name:  String,
    pub email: String,
}
