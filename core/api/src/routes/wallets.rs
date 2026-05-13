use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_types::{Currency, MerchantId, WalletId};
use banzami_wallets::{CreateWalletRequest, WalletEngine, WalletError};

use crate::{error::{ApiError, ApiResult}, state::AppState};

#[derive(Deserialize)]
pub struct CreateWalletBody {
    pub merchant_id: String,
    pub currency:    String,
}

#[derive(Deserialize)]
pub struct WalletForMerchantQuery {
    pub merchant_id: String,
    pub currency:    String,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateWalletBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id: MerchantId = body.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let wallet = state.wallet
        .create(CreateWalletRequest { merchant_id, currency })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&wallet).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let wallet = state.wallet
        .get(wallet_id)
        .await
        .map_err(|e| match e {
            WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}

pub async fn balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let wallet_id: WalletId = id.parse()
        .map_err(|_| ApiError::bad_request("invalid wallet id"))?;

    let bal = state.wallet
        .balance(wallet_id)
        .await
        .map_err(|e| match e {
            WalletError::NotFound(_) => ApiError::not_found("wallet not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&bal).unwrap()))
}

/// GET /internal/v1/wallets?merchant_id=&currency=
pub async fn get_for_merchant(
    State(state): State<AppState>,
    Query(q): Query<WalletForMerchantQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = q.merchant_id.parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let currency = Currency::from_code(&q.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", q.currency)))?;

    let wallet = state.wallet
        .get_for_merchant(merchant_id, currency)
        .await
        .map_err(|e| match e {
            WalletError::NoWalletForMerchant { .. } => ApiError::not_found("no wallet for this merchant and currency"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&wallet).unwrap()))
}
