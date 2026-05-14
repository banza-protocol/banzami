use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_settlement::{
    CreateSettlementBatchRequest, SettlementEngine, SettlementError,
};
use banzami_types::{MerchantId, SettlementId, WalletId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Create batch
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateBatchBody {
    pub idempotency_key:   String,
    pub merchant_id:       String,
    pub wallet_id:         String,
    pub gross_amount_minor: i64,
    pub fee_amount_minor:   i64,
    pub currency:           String,
    pub transaction_count:  u32,
    pub period_start:       chrono::DateTime<chrono::Utc>,
    pub period_end:         chrono::DateTime<chrono::Utc>,
}

pub async fn create_batch(
    State(state): State<AppState>,
    Json(body): Json<CreateBatchBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id: MerchantId = body.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;
    let wallet_id: WalletId = body.wallet_id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;
    let currency = banzami_types::Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request("unknown currency"))?;

    let gross = banzami_types::Money::new(body.gross_amount_minor, currency);
    let fee   = banzami_types::Money::new(body.fee_amount_minor, currency);

    let settlement = state.settlement.create_batch(CreateSettlementBatchRequest {
        idempotency_key:  body.idempotency_key,
        merchant_id,
        wallet_id,
        gross_amount:     gross,
        fee_amount:       fee,
        transaction_count: body.transaction_count,
        period_start:     body.period_start,
        period_end:       body.period_end,
    })
    .await
    .map_err(|e| match e {
        SettlementError::FeeExceedsGross { .. } => ApiError::bad_request("fee_amount exceeds gross_amount"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&settlement).unwrap())))
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let settlement_id: SettlementId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))?;

    let s = state.settlement.get(settlement_id).await.map_err(|e| match e {
        SettlementError::NotFound(_) => ApiError::not_found("settlement not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&s).unwrap()))
}

// ---------------------------------------------------------------------------
// List for merchant
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListQuery {
    pub merchant_id: String,
}

pub async fn list_for_merchant(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let settlements = state.settlement
        .list_for_merchant(merchant_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "data": settlements })))
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

fn default_limit() -> i64 { 100 }

pub async fn list_all(
    State(state): State<AppState>,
    Query(q): Query<ListAllQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let settlements = state.settlement
        .list_all(q.limit.clamp(1, 200), q.status)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "data": settlements })))
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

pub async fn submit(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let sid: SettlementId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))?;

    let s = state.settlement.submit(sid).await.map_err(|e| match e {
        SettlementError::NotFound(_) => ApiError::not_found("settlement not found"),
        SettlementError::InvalidStatusTransition { .. } => {
            ApiError::unprocessable("INVALID_TRANSITION", &e.to_string())
        }
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn confirm(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let sid: SettlementId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))?;

    let s = state.settlement.confirm(sid).await.map_err(|e| match e {
        SettlementError::NotFound(_) => ApiError::not_found("settlement not found"),
        SettlementError::InvalidStatusTransition { .. } => {
            ApiError::unprocessable("INVALID_TRANSITION", &e.to_string())
        }
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&s).unwrap()))
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
    let sid: SettlementId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))?;

    let s = state.settlement.fail(sid, body.reason).await.map_err(|e| match e {
        SettlementError::NotFound(_) => ApiError::not_found("settlement not found"),
        SettlementError::InvalidStatusTransition { .. } => {
            ApiError::unprocessable("INVALID_TRANSITION", &e.to_string())
        }
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&s).unwrap()))
}

