//! Settlement readiness — whether a financial owner can settle, answered by the
//! code that settles.
//!
//! An integrating application asks "is my Project financially ready?" before it
//! offers a campaign close. That question used to be answered in the Go gateway,
//! by a second copy of the rules: its own SQL for which pricing rule applies, and
//! a list of blockers that never looked at the fee destination at all. So the
//! readiness view could say READY while settlement refused with
//! FEE_DESTINATION_TYPE_NOT_ALLOWED, and nobody could tell which one was right.
//!
//! Here, every rule is the one settlement enforces:
//!
//!   the rate         ← `ApplicationSettlementEngine::resolve_settlement_fee`
//!   the destination  ← `application_settlements::evaluate_fee_destination`
//!
//! `settlement.ready == true` therefore means every deterministic prerequisite
//! the settlement path checks currently passes. What it cannot know in advance —
//! the specific source account's balance, the beneficiary a request will name —
//! belongs to each settlement, not to readiness.
//!
//! The response carries no internal identifier: no merchant, wallet, account or
//! rule id. It is projected onto a public Project-key contract as-is.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use banzami_app_settlement::{ApplicationSettlementEngine, ApplicationSettlementError};
use banzami_pricing::PricingOperation;
use banzami_types::{AccountId, Currency, Money};

use super::application_settlements::{evaluate_fee_destination, FeeDestinationEvaluation};
use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

/// A representative amount to resolve the rate at. The RATE does not depend on
/// it; a rule's flat or minimum component would, and those are reported
/// separately so nothing is inferred from one example.
const REFERENCE_GROSS_MINOR: i64 = 1_000_000;

#[derive(Deserialize)]
pub struct ReadinessBody {
    pub merchant_id: String,
    /// Settlement currency. AOA today.
    pub currency: Option<String>,
    /// A specific fee destination to evaluate, already resolved by the caller
    /// from a @banza it was given. Absent: the owner's own financial identity,
    /// which is what ADR-028 requires a fee destination to be anyway.
    pub fee_destination: Option<FeeDestinationInput>,
}

#[derive(Deserialize)]
pub struct FeeDestinationInput {
    pub handle: String,
    /// None when the handle did not resolve to an account at all.
    pub account_id: Option<String>,
    /// Whether it belongs to the asking owner — settlement refuses anyone else's.
    pub owned: bool,
}

#[derive(Serialize, Default)]
pub struct Readiness {
    pub financial_identity: FinancialIdentity,
    pub kyb: Kyb,
    pub wallet: Wallet,
    pub pricing: Pricing,
    pub fee_destination: FeeDestination,
    pub settlement: Settlement,
}

#[derive(Serialize, Default)]
pub struct FinancialIdentity {
    /// The @banza this owner is reachable by, without the "@". None when it has
    /// none — which also means it cannot be named as a fee destination.
    pub handle: Option<String>,
}

#[derive(Serialize, Default)]
pub struct Kyb {
    pub status: String,
}

#[derive(Serialize, Default)]
pub struct Wallet {
    pub status: Option<String>,
    pub currency: String,
    pub ready: bool,
}

#[derive(Serialize, Default)]
pub struct Pricing {
    /// The profile an operator assigned. None: unpriced — which is not free.
    pub profile: Option<String>,
    /// A SETTLEMENT rule resolves for this owner.
    pub configured: bool,
    pub settlement_bps: Option<u32>,
    pub settlement_flat_minor: Option<i64>,
    pub payout_bps: Option<u32>,
}

#[derive(Serialize, Default)]
pub struct FeeDestination {
    pub handle: Option<String>,
    /// Whether this owner's pricing charges an application fee at all. When it
    /// does not, the destination is reported but blocks nothing — there is no
    /// fee to allocate.
    pub required: bool,
    pub resolved: bool,
    pub owned_by_project: bool,
    pub active: bool,
    pub kyb_approved: bool,
    pub wallet_active: bool,
    pub type_allowed: bool,
    /// ADR-028 does not require a dedicated APPLICATION-purpose wallet account:
    /// the fee is credited to the destination's own account. Stated rather than
    /// omitted, so a consumer never has to guess whether one is missing.
    pub application_account_required: bool,
    pub eligible: bool,
    pub blocker: Option<&'static str>,
}

#[derive(Serialize, Default)]
pub struct Settlement {
    pub ready: bool,
    pub blockers: Vec<&'static str>,
    pub warnings: Vec<&'static str>,
}

/// POST /internal/v1/settlement-readiness
pub async fn settlement_readiness(
    State(state): State<AppState>,
    Json(body): Json<ReadinessBody>,
) -> ApiResult<Json<Readiness>> {
    let merchant_id = Uuid::parse_str(body.merchant_id.trim())
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let currency_code = body.currency.as_deref().unwrap_or("AOA");
    let currency = Currency::from_code(currency_code)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {currency_code}")))?;

    // The owner's facts: identity, KYB, its ACTIVE wallet in this currency, and
    // the pricing profile an operator assigned. The profile predicate is the one
    // the settlement path uses: enabled, and in this deployment's environment.
    let row = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, Option<Uuid>, Option<String>)>(
        "SELECT hr.handle, c.kyb_status, w.status, w.available_account_id, pp.code
           FROM merchants m
           LEFT JOIN handle_registry hr
                  ON hr.owner_id = m.id AND hr.owner_type = 'MERCHANT'
           LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
           LEFT JOIN LATERAL (
               SELECT status, available_account_id FROM wallets
                WHERE merchant_id = m.id AND currency = $2
                ORDER BY (status = 'ACTIVE') DESC, created_at
                LIMIT 1
           ) w ON TRUE
           LEFT JOIN pricing_profiles pp
                  ON pp.id = m.pricing_profile_id AND pp.enabled AND pp.environment = $3
          WHERE m.id = $1",
    )
    .bind(merchant_id)
    .bind(currency_code)
    .bind(state.environment.as_str())
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;
    let Some((handle, kyb_status, wallet_status, own_account, profile)) = row else {
        return Err(ApiError::not_found("financial owner not found"));
    };

    let mut out = Readiness::default();
    let mut blockers: Vec<&'static str> = Vec::new();

    out.financial_identity.handle = handle.clone();
    out.kyb.status = kyb_status.unwrap_or_else(|| "PENDING".into());
    out.wallet.currency = currency_code.to_string();
    out.wallet.status = wallet_status.clone();
    out.wallet.ready = wallet_status.as_deref() == Some("ACTIVE") && own_account.is_some();
    // Settlement moves money out of a segregated account held by this wallet. No
    // ACTIVE wallet, no account to settle from.
    if !out.wallet.ready {
        blockers.push("WALLET_MISSING");
    }

    // The rate — decided by the method settlement itself calls.
    out.pricing.profile = profile.clone();
    let reference = Money::new(REFERENCE_GROSS_MINOR, currency);
    let mut fee_required = false;
    match state
        .app_settlement
        .resolve_settlement_fee(reference, profile.as_deref())
        .await
    {
        Ok(r) => {
            out.pricing.configured = true;
            out.pricing.settlement_bps = Some(r.snapshot.rate_bps);
            out.pricing.settlement_flat_minor = Some(r.snapshot.flat_minor);
            fee_required = r.snapshot.rate_bps > 0
                || r.snapshot.flat_minor > 0
                || r.snapshot.min_fee_minor.unwrap_or(0) > 0;
        }
        Err(ApplicationSettlementError::PricingAmbiguous { .. }) => {
            blockers.push("PRICING_CONFIGURATION_ERROR")
        }
        Err(ApplicationSettlementError::PricingNotConfigured) => {
            blockers.push("PRICING_NOT_CONFIGURED")
        }
        // A pricing store that cannot be read is an outage, not a configuration
        // fact. Reporting it as "not configured" would send an operator to fix a
        // setting that is fine.
        Err(e) => return Err(ApiError::internal(e.to_string())),
    }
    if let Ok(r) = state
        .app_settlement
        .resolve_operation_rate(reference, profile.as_deref(), PricingOperation::Payout)
        .await
    {
        out.pricing.payout_bps = Some(r.snapshot.rate_bps);
    }

    // The fee destination — by the function settlement's guard calls.
    let (dest_handle, dest_account, owned) = match body.fee_destination {
        Some(d) => {
            let acct = match d.account_id.as_deref() {
                Some(a) => Some(
                    a.parse::<AccountId>()
                        .map_err(|_| ApiError::bad_request("invalid fee_destination.account_id"))?,
                ),
                None => None,
            };
            (Some(d.handle), acct, d.owned)
        }
        None => (handle.clone(), own_account.map(AccountId::from_uuid), true),
    };
    let fd = &mut out.fee_destination;
    fd.handle = dest_handle;
    fd.required = fee_required;
    fd.owned_by_project = owned;
    fd.application_account_required = false;
    let dest_blocker: Option<&'static str> = match (fd.handle.is_some(), dest_account) {
        (false, _) | (true, None) => Some("FEE_DESTINATION_NOT_FOUND"),
        (true, Some(acct)) => {
            let ev: FeeDestinationEvaluation = evaluate_fee_destination(&state.pool, acct).await?;
            fd.resolved = ev.resolved;
            fd.active = ev.active;
            fd.kyb_approved = ev.kyb_approved;
            fd.wallet_active = ev.wallet_active;
            fd.type_allowed = ev.type_allowed;
            if !owned {
                // Settlement checks ownership before anything else about a named
                // destination, and a stranger's compliance state is not reported.
                Some("FEE_DESTINATION_NOT_OWNED")
            } else {
                ev.blocker
            }
        }
    };
    fd.blocker = dest_blocker;
    fd.eligible = dest_blocker.is_none();
    // Only a fee makes the destination a prerequisite. On a zero-rate profile
    // there is nothing to allocate, and settlement does not look at it.
    if fee_required {
        if let Some(b) = dest_blocker {
            blockers.push(b);
        }
    }

    // Advisory: without a webhook endpoint an application learns about a
    // completed settlement only by polling. Never blocks.
    let has_webhook: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM webhook_endpoints WHERE merchant_id = $1 AND active = true)",
    )
    .bind(merchant_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(true);
    if !has_webhook {
        out.settlement.warnings.push("WEBHOOK_ENDPOINT_MISSING");
    }

    out.settlement.ready = blockers.is_empty();
    out.settlement.blockers = blockers;
    Ok(Json(out))
}
