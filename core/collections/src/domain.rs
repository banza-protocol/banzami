//! Domain types for Collections + PaymentIntent (BANZA ADR-036/037).
//!
//! These mirror the canonical protocol schemas in `~/banza/contracts/collections/*`
//! and `~/banza/contracts/payment-intents/*`. The operator invents no semantics.

use banzami_types::{
    CollectionId, CollectionShareId, MerchantId, PaymentIntentId, TransferId, WalletId,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------

macro_rules! str_enum {
    ($name:ident { $($variant:ident => $s:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
        pub enum $name { $($variant),+ }
        impl $name {
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $s),+ }
            }
            pub fn try_from_str(s: &str) -> Option<Self> {
                match s { $($s => Some(Self::$variant),)+ _ => None }
            }
        }
    };
}

str_enum!(CollectionStatus {
    Draft => "DRAFT",
    Open => "OPEN",
    PartiallyCompleted => "PARTIALLY_COMPLETED",
    Completed => "COMPLETED",
    Expired => "EXPIRED",
    Cancelled => "CANCELLED",
    Failed => "FAILED",
});

str_enum!(ShareStatus {
    Pending => "PENDING",
    LinkCreated => "LINK_CREATED",
    Paid => "PAID",
    Expired => "EXPIRED",
    Cancelled => "CANCELLED",
    Failed => "FAILED",
});

str_enum!(IntentStatus {
    Created => "CREATED",
    Requested => "REQUESTED",
    Paid => "PAID",
    Expired => "EXPIRED",
    Cancelled => "CANCELLED",
    Failed => "FAILED",
});

str_enum!(Surface {
    Link => "LINK",
    Qr => "QR",
    Request => "REQUEST",
});

// ---------------------------------------------------------------------------
// CollectionRule — extensible tagged strategy (collection-rule.schema.json)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Divisibility {
    #[default]
    Exact,
    RemainderToFirst,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixedShare {
    pub amount_minor: i64,
    #[serde(default)]
    pub participant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PercentShare {
    pub percent: f64,
    #[serde(default)]
    pub participant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CollectionRule {
    #[serde(rename = "EQUAL_SPLIT")]
    EqualSplit {
        participants_count: i64,
        #[serde(default)]
        divisibility: Divisibility,
    },
    #[serde(rename = "FIXED_AMOUNTS")]
    FixedAmounts { shares: Vec<FixedShare> },
    #[serde(rename = "PERCENTAGE")]
    Percentage {
        shares: Vec<PercentShare>,
        #[serde(default)]
        divisibility: Divisibility,
    },
    #[serde(rename = "OPEN_CONTRIBUTION")]
    OpenContribution {
        #[serde(default)]
        target_minor: Option<i64>,
        #[serde(default = "default_true")]
        allow_overpay: bool,
    },
    #[serde(rename = "MINIMUM_CONTRIBUTION")]
    MinimumContribution {
        min_minor: i64,
        #[serde(default)]
        target_minor: Option<i64>,
    },
}

fn default_true() -> bool {
    true
}

impl CollectionRule {
    /// Closed rules have a fixed, predeclared set of shares whose amounts must
    /// sum to the collection total. Open rules accept dynamic contributions.
    pub fn is_closed(&self) -> bool {
        matches!(
            self,
            CollectionRule::EqualSplit { .. }
                | CollectionRule::FixedAmounts { .. }
                | CollectionRule::Percentage { .. }
        )
    }
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: CollectionId,
    pub operator_id: String,
    pub creator: String,
    pub owner: String,
    pub merchant_id: MerchantId,
    pub wallet_id: WalletId,
    pub title: Option<String>,
    pub description: Option<String>,
    pub currency: String,
    pub total_amount_minor: i64,
    pub status: CollectionStatus,
    pub rule: CollectionRule,
    pub environment: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionShare {
    pub id: CollectionShareId,
    pub collection_id: CollectionId,
    pub merchant_id: MerchantId,
    pub participant: Option<String>,
    pub amount_minor: i64,
    pub currency: String,
    pub status: ShareStatus,
    pub payment_intent_id: Option<PaymentIntentId>,
    pub transfer_id: Option<TransferId>,
    pub environment: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub paid_at: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentIntent {
    pub id: PaymentIntentId,
    pub operator_id: String,
    pub merchant_id: MerchantId,
    pub payee_wallet_id: WalletId,
    pub amount_minor: Option<i64>,
    pub currency: String,
    pub surface: Surface,
    pub surface_ref: Option<String>,
    pub status: IntentStatus,
    pub transfer_id: Option<TransferId>,
    pub environment: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

pub struct CreateCollectionRequest {
    pub operator_id: String,
    pub creator: String,
    pub owner: String,
    pub merchant_id: MerchantId,
    pub wallet_id: WalletId,
    pub title: Option<String>,
    pub description: Option<String>,
    pub currency: String,
    pub total_amount_minor: i64,
    pub rule: CollectionRule,
    pub environment: String,
    pub idempotency_key: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub open_immediately: bool,
}

pub struct CreateShareRequest {
    pub amount_minor: i64,
    pub participant: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub idempotency_key: Option<String>,
}

/// A share amount resolved from the rule at creation time (closed rules).
pub struct ResolvedShare {
    pub amount_minor: i64,
    pub participant: Option<String>,
}
