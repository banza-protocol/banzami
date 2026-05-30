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

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let payout_id: PayoutId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid payout id"))?;

    let p = state.payout.get(payout_id).await.map_err(|e| match e {
        PayoutError::NotFound(_) => ApiError::not_found("payout not found"),
        other => ApiError::internal(other.to_string()),
    })?;

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
