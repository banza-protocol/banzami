use chrono::{DateTime, Utc};
use banzami_types::{MerchantId, PaymentLinkId, WalletId};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentLinkStatus {
    Active,
    Used,
    Expired,
    Cancelled,
}

impl PaymentLinkStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            PaymentLinkStatus::Active    => "ACTIVE",
            PaymentLinkStatus::Used      => "USED",
            PaymentLinkStatus::Expired   => "EXPIRED",
            PaymentLinkStatus::Cancelled => "CANCELLED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE"    => Some(Self::Active),
            "USED"      => Some(Self::Used),
            "EXPIRED"   => Some(Self::Expired),
            "CANCELLED" => Some(Self::Cancelled),
            _           => None,
        }
    }
}

/// A shareable link that lets anyone pay a merchant without authentication.
///
/// Primary use cases: WhatsApp/Instagram commerce, freelancer invoices,
/// informal merchants who cannot integrate a full checkout SDK.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct PaymentLink {
    pub id:             PaymentLinkId,
    /// Short URL-safe identifier (12 hex chars). Used in the public pay URL.
    pub slug:           String,
    pub merchant_id:    MerchantId,
    pub wallet_id:      WalletId,
    /// Fixed amount in minor units. `None` means the payer sets the amount.
    pub amount_minor:   Option<i64>,
    pub currency:       String,
    pub description:    Option<String>,
    pub status:         PaymentLinkStatus,
    pub expires_at:     Option<DateTime<Utc>>,
    pub paid_at:        Option<DateTime<Utc>>,
    pub created_at:     DateTime<Utc>,
    pub updated_at:     DateTime<Utc>,
}

pub struct CreatePaymentLinkRequest {
    pub merchant_id:  MerchantId,
    pub wallet_id:    WalletId,
    pub amount_minor: Option<i64>,
    pub currency:     String,
    pub description:  Option<String>,
    pub expires_at:   Option<DateTime<Utc>>,
}
