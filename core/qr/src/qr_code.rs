use chrono::{DateTime, Utc};
use banzami_types::{Currency, QrCodeId};

/// Who owns the QR code — determines the payment destination.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QrOwnerType {
    Consumer,
    Merchant,
}

impl QrOwnerType {
    pub const fn as_str(self) -> &'static str {
        match self {
            QrOwnerType::Consumer => "CONSUMER",
            QrOwnerType::Merchant => "MERCHANT",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "CONSUMER" => Some(QrOwnerType::Consumer),
            "MERCHANT" => Some(QrOwnerType::Merchant),
            _          => None,
        }
    }
}

/// Static vs. dynamic QR — two distinct payment modes.
///
/// | Mode    | Use case                          | Reusable | Amount |
/// |---------|-----------------------------------|----------|--------|
/// | Static  | Personal handle, shop counter     | Yes      | Payer sets |
/// | Dynamic | Invoice, e-commerce, POS terminal | No       | Pre-set |
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QrCodeType {
    Static,
    Dynamic,
}

impl QrCodeType {
    pub const fn as_str(self) -> &'static str {
        match self {
            QrCodeType::Static  => "STATIC",
            QrCodeType::Dynamic => "DYNAMIC",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "STATIC"  => Some(QrCodeType::Static),
            "DYNAMIC" => Some(QrCodeType::Dynamic),
            _         => None,
        }
    }
}

/// Lifecycle of a QR code record.
///
/// Static codes remain ACTIVE until explicitly deactivated.
/// Dynamic codes expire by time or after a single successful use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QrCodeStatus {
    Active,
    Expired,
    Used,
}

impl QrCodeStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            QrCodeStatus::Active  => "ACTIVE",
            QrCodeStatus::Expired => "EXPIRED",
            QrCodeStatus::Used    => "USED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "ACTIVE"  => Some(QrCodeStatus::Active),
            "EXPIRED" => Some(QrCodeStatus::Expired),
            "USED"    => Some(QrCodeStatus::Used),
            _         => None,
        }
    }
}

/// A persisted QR code record.
///
/// The scannable string (the actual QR image payload) is generated on demand
/// by [`crate::engine::QrEngine::encode`] from this record — it is never stored.
#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct QrCode {
    pub id:           QrCodeId,
    /// UUID of the consumer or merchant that receives payment.
    pub owner_id:     uuid::Uuid,
    pub owner_type:   QrOwnerType,
    pub qr_type:      QrCodeType,
    pub currency:     Currency,
    /// Pre-set amount for dynamic QR. `None` for static (payer enters amount).
    pub amount_minor: Option<i64>,
    pub status:       QrCodeStatus,
    /// `None` for static QR (never expires).
    pub expires_at:   Option<DateTime<Utc>>,
    pub used_at:      Option<DateTime<Utc>>,
    /// Optional opaque merchant/consumer reference (e.g. order ID).
    pub reference:    Option<String>,
    pub created_at:   DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

pub struct CreateStaticQrRequest {
    pub owner_id:   uuid::Uuid,
    pub owner_type: QrOwnerType,
    pub currency:   Currency,
    /// Optional default amount to pre-fill on the payer's device.
    pub amount_minor: Option<i64>,
}

pub struct CreateDynamicQrRequest {
    pub owner_id:    uuid::Uuid,
    pub owner_type:  QrOwnerType,
    pub currency:    Currency,
    pub amount_minor: i64,
    pub expires_at:  DateTime<Utc>,
    pub reference:   Option<String>,
}

// ---------------------------------------------------------------------------
// Decoded payload types (returned by parse / resolve)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ParsedQr {
    pub qr_type:  QrCodeType,
    /// Present for static QR. `None` for dynamic (look up the DB record).
    pub owner_id: Option<uuid::Uuid>,
    pub owner_type: Option<QrOwnerType>,
    pub currency:   Option<Currency>,
    /// `qr_code_id` for dynamic QR — needed to fetch the DB record.
    pub qr_code_id: Option<QrCodeId>,
}
