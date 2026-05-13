use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_consumer_wallets::{ConsumerWalletEngine, ConsumerWalletError};
use banzami_types::Currency;

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request / query types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateConsumerWalletBody {
    pub consumer_id: String,
    pub currency:    String,
}

#[derive(Deserialize)]
pub struct GetForConsumerQuery {
    pub consumer_id: String,
    pub currency:    String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateConsumerWalletBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let consumer_id = body
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let wallet = state
        .consumer_wallet
        .get_or_create(consumer_id, currency)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&wallet).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let wallet = state
        .consumer_wallet
        .get(wallet_id)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_) => ApiError::not_found("consumer wallet not found"),
            other                            => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

pub async fn balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let bal = state
        .consumer_wallet
        .balance(wallet_id)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NotFound(_) => ApiError::not_found("consumer wallet not found"),
            other                            => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&bal).unwrap()))
}

pub async fn get_for_consumer(
    State(state): State<AppState>,
    Query(q): Query<GetForConsumerQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = q
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;
    let currency = Currency::from_code(&q.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", q.currency)))?;

    let wallet = state
        .consumer_wallet
        .get_for_consumer(consumer_id, currency)
        .await
        .map_err(|e| match e {
            ConsumerWalletError::NoWalletForConsumer { .. } => {
                ApiError::not_found("no wallet for consumer in that currency")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}
