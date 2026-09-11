use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_payouts::{BankDestination, CreatePayoutRequest, PayoutEngine, PayoutError};
use banzami_types::{MerchantId, PayoutId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Initiate
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct InitiateBody {
    pub idempotency_key: String,
    pub merchant_id: String,
    pub wallet_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub bank_account_number: String,
    pub bank_code: String,
    pub account_holder_name: String,
}

pub async fn initiate(
    State(state): State<AppState>,
    Json(body): Json<InitiateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    if body.idempotency_key.is_empty() {
        return Err(ApiError::bad_request("idempotency_key is required"));
    }
    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let merchant_id: MerchantId = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let wallet_id: WalletId = body
        .wallet_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let currency = banzami_types::Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request("unknown currency"))?;
    // A frozen merchant withdraws nothing.
    super::risk::ensure_not_frozen(&state.pool, "MERCHANT", merchant_id.as_uuid()).await?;

    let payout = state
        .payout
        .initiate(CreatePayoutRequest {
            idempotency_key: body.idempotency_key,
            merchant_id,
            wallet_id,
            amount: banzami_types::Money::new(body.amount_minor, currency),
            destination: BankDestination {
                account_number: body.bank_account_number,
                bank_code: body.bank_code,
                account_holder_name: body.account_holder_name,
            },
        })
        .await
        .map_err(|e| match e {
            PayoutError::InsufficientBalance { .. } => {
                ApiError::unprocessable("INSUFFICIENT_BALANCE", e.to_string())
            }
            PayoutError::DuplicateIdempotencyKey(_) => {
                ApiError::conflict("CONFLICT", "idempotency key already used")
            }
            // RA-056 — the caller named a wallet it does not own. Reported as a
            // plain not-found: it has no authority over that wallet, so it must
            // not learn whether the id exists.
            PayoutError::WalletNotOwned { .. } => {
                ApiError::not_found("wallet not found for this merchant")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&payout).unwrap()),
    ))
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct GetQuery {
    /// Owning merchant. Required: a payout carries a bank destination and an
    /// amount, so it must never be readable by id alone (RA-056).
    pub merchant_id: Option<String>,
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<GetQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let payout_id: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;

    // Fail closed: an unscoped read is refused outright rather than served.
    let merchant_id: MerchantId = q
        .merchant_id
        .as_deref()
        .ok_or_else(|| ApiError::bad_request("merchant_id is required"))?
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let p = state.payout.get(payout_id).await.map_err(|e| match e {
        PayoutError::NotFound(_) => ApiError::not_found("payout not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    // Ownership decides visibility, and a foreign payout is indistinguishable
    // from a missing one.
    if p.merchant_id != merchant_id {
        return Err(ApiError::not_found("payout not found"));
    }

    Ok(Json(serde_json::to_value(&p).unwrap()))
}

// ---------------------------------------------------------------------------
// List for merchant
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListQuery {
    pub merchant_id: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

pub async fn list_for_merchant(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let payouts = state
        .payout
        .list_for_merchant(merchant_id, q.limit.clamp(1, 200))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "data": payouts })))
}

// ---------------------------------------------------------------------------
// List all (admin — no merchant filter)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListAllQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub status: Option<String>,
}

pub async fn list_all(
    State(state): State<AppState>,
    Query(q): Query<ListAllQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let payouts = state
        .payout
        .list_all(q.limit.clamp(1, 200), q.status)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "data": payouts })))
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

fn transition_err(e: PayoutError) -> ApiError {
    match e {
        PayoutError::NotFound(_) => ApiError::not_found("payout not found"),
        PayoutError::InvalidStatusTransition { .. } => {
            ApiError::unprocessable("INVALID_TRANSITION", e.to_string())
        }
        // A refused price is a configuration state someone can act on, not an
        // outage. Reporting it as 500 would tell an operator their system is
        // broken when what is missing is a rule they have to write, and would
        // put a deliberate refusal in the same bucket as a database failure.
        PayoutError::PricingNotConfigured => ApiError::conflict(
            "PRICING_NOT_CONFIGURED",
            "no PAYOUT pricing rule applies to this owner's pricing profile; \
             the withdrawal was refused and nothing moved",
        ),
        PayoutError::PricingAmbiguous { candidates } => ApiError::conflict(
            "PRICING_CONFIGURATION_ERROR",
            format!(
                "{candidates} PAYOUT pricing rules apply to this owner's pricing profile; \
                 the withdrawal was refused rather than priced by guesswork"
            ),
        ),
        other => ApiError::internal(other.to_string()),
    }
}

pub async fn process(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let pid: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;
    let p = state.payout.process(pid).await.map_err(transition_err)?;
    Ok(Json(serde_json::to_value(&p).unwrap()))
}

pub async fn mark_sent(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let pid: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;
    let p = state.payout.mark_sent(pid).await.map_err(transition_err)?;
    Ok(Json(serde_json::to_value(&p).unwrap()))
}

pub async fn confirm(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let pid: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;
    let p = state.payout.confirm(pid).await.map_err(transition_err)?;
    Ok(Json(serde_json::to_value(&p).unwrap()))
}

#[derive(Deserialize)]
pub struct FailBody {
    pub reason: String,
}

pub async fn fail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let pid: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;
    let p = state
        .payout
        .fail(pid, body.reason)
        .await
        .map_err(transition_err)?;
    Ok(Json(serde_json::to_value(&p).unwrap()))
}

pub async fn mark_returned(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let pid: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;
    let p = state
        .payout
        .mark_returned(pid)
        .await
        .map_err(transition_err)?;
    Ok(Json(serde_json::to_value(&p).unwrap()))
}
