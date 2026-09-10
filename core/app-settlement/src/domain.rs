//! Application Settlement domain models (Banzami ADR-021 / BANZA ADR-039).
//!
//! An Application Settlement pays a **beneficiary** from net value already sitting
//! in an **application-controlled** wallet (e.g. a campaign wallet), after a
//! business event the application decides on (campaign close, delivery, sale,
//! period end). It is distinct from the per-payment **Operator Fee**: it happens
//! later, over accumulated net value, and any fee it carries (the *application
//! fee*) belongs to the application/platform — not the operator.
//!
//! Mirrors `~/banza/contracts/settlements/application-settlement.schema.json` +
//! `state-machine.json`. Amounts are integer minor units; never float.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use banzami_types::{AccountId, ApplicationSettlementId, Currency, LedgerPostingId, Money};

/// Lifecycle (BANZA ADR-039 state machine). Only `Completed` writes a ledger
/// posting; `Completed`/`Failed`/`Cancelled` are terminal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApplicationSettlementStatus {
    Created,
    Pending,
    Completed,
    Failed,
    Cancelled,
}

impl ApplicationSettlementStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ApplicationSettlementStatus::Created => "CREATED",
            ApplicationSettlementStatus::Pending => "PENDING",
            ApplicationSettlementStatus::Completed => "COMPLETED",
            ApplicationSettlementStatus::Failed => "FAILED",
            ApplicationSettlementStatus::Cancelled => "CANCELLED",
        }
    }

    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "CREATED" => Some(ApplicationSettlementStatus::Created),
            "PENDING" => Some(ApplicationSettlementStatus::Pending),
            "COMPLETED" => Some(ApplicationSettlementStatus::Completed),
            "FAILED" => Some(ApplicationSettlementStatus::Failed),
            "CANCELLED" => Some(ApplicationSettlementStatus::Cancelled),
            _ => None,
        }
    }

    /// Strict, forward-only transitions. Terminal states never transition.
    pub const fn can_transition_to(self, next: Self) -> bool {
        use ApplicationSettlementStatus::*;
        matches!(
            (self, next),
            (Created, Pending)
                | (Created, Completed)
                | (Created, Cancelled)
                | (Created, Failed)
                | (Pending, Completed)
                | (Pending, Cancelled)
                | (Pending, Failed)
        )
    }

    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            ApplicationSettlementStatus::Completed
                | ApplicationSettlementStatus::Failed
                | ApplicationSettlementStatus::Cancelled
        )
    }
}

/// The aggregate. Once `COMPLETED` it is immutable — a correction is only ever a
/// future reversal posting, never a mutation (ADR-002, append-only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationSettlement {
    pub id: ApplicationSettlementId,
    /// Opaque application/aggregate reference (e.g. a campaign id). The operator
    /// does not interpret it.
    pub owner_ref: String,
    /// Optional application identity.
    pub application_id: Option<String>,

    /// Ledger account the gross is debited from (the app-controlled / campaign
    /// available account).
    pub source_account_id: AccountId,
    /// Ledger account the net is credited to (the beneficiary available account).
    pub beneficiary_account_id: AccountId,
    /// Ledger account the application fee is credited to (the application's own
    /// account). `None` when there is no fee.
    pub application_fee_account_id: Option<AccountId>,

    pub gross_amount: Money,
    pub application_fee: Money,
    pub net_amount: Money,
    pub currency: Currency,

    // pricing references + immutable snapshot (audit) -----------------------
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub pricing_rule_id: Option<banzami_types::PricingRuleId>,
    pub pricing_rule_version: Option<i32>,
    pub engine_version: i32,
    pub pricing_snapshot_json: serde_json::Value,

    pub status: ApplicationSettlementStatus,
    /// Net posting produced on COMPLETED (source -> beneficiary).
    pub settlement_posting_id: Option<LedgerPostingId>,
    /// Fee posting produced on COMPLETED when the fee > 0 (source -> app fee).
    pub fee_posting_id: Option<LedgerPostingId>,

    pub environment: String,
    pub idempotency_key: String,
    pub metadata: serde_json::Value,

    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub failed_at: Option<DateTime<Utc>>,
    pub failure_reason: Option<String>,
}

/// Request to create a settlement.
///
/// The application fee is the operator's pricing decision and nothing else: it
/// is resolved by the Pricing Engine from the owner's assigned `pricing_profile`
/// for the SETTLEMENT operation. There is no field here through which a caller
/// could name a rate or an amount.
///
/// There used to be one. ADR-029's "app-defined" path took an
/// `application_fee_bps` from the caller and, when present, skipped the Pricing
/// Engine entirely — so the rate an application paid was whatever it asked for,
/// up to a 50% bound. It was withdrawn: a caller cannot set the price of the
/// service it is buying.
pub struct CreateApplicationSettlementRequest {
    pub idempotency_key: String,
    pub owner_ref: String,
    pub application_id: Option<String>,
    pub source_account_id: AccountId,
    pub beneficiary_account_id: AccountId,
    /// Required when the resolved application fee is > 0; the app's fee account.
    pub application_fee_account_id: Option<AccountId>,
    /// Accumulated net value to settle (already net of the operator fee charged
    /// at payment time). Must be positive.
    pub gross_amount: Money,
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub metadata: Option<serde_json::Value>,
}
