use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_transfers::{SendTransferRequest, TransferEngine, TransferError};
use banzami_types::{Currency, TransferId};

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request / query types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SendTransferBody {
    pub idempotency_key: String,
    pub sender_id:       String,
    pub recipient_id:    String,
    pub amount_minor:    i64,
    pub currency:        String,
    pub description:     Option<String>,
}

#[derive(Deserialize)]
pub struct ListTransfersQuery {
    pub consumer_id:       String,
    pub limit:             Option<i64>,
    pub before_created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub before_id:         Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn send(
    State(state): State<AppState>,
    Json(body): Json<SendTransferBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let sender_id = body
        .sender_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid sender_id"))?;

    let recipient_id = body
        .recipient_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid recipient_id"))?;

    let transfer = state
        .transfer
        .send(SendTransferRequest {
            idempotency_key: body.idempotency_key,
            sender_id,
            recipient_id,
            amount_minor: body.amount_minor,
            currency,
            description: body.description,
        })
        .await
        .map_err(|e| match e {
            TransferError::SelfTransfer     => ApiError::bad_request("cannot transfer to yourself"),
            TransferError::InvalidAmount    => ApiError::bad_request("amount_minor must be positive"),
            TransferError::InsufficientFunds { available, requested } => {
                ApiError::unprocessable(
                    "INSUFFICIENT_FUNDS",
                    format!("available {available}, requested {requested}"),
                )
            }
            TransferError::WalletNotFound { .. } => {
                ApiError::unprocessable("WALLET_NOT_FOUND", "sender or recipient has no wallet")
            }
            TransferError::WalletNotActive(_) => {
                ApiError::unprocessable("WALLET_NOT_ACTIVE", "wallet is not active")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&transfer).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let transfer_id: TransferId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transfer id"))?;

    let transfer = state
        .transfer
        .get(transfer_id)
        .await
        .map_err(|e| match e {
            TransferError::NotFound(_) => ApiError::not_found("transfer not found"),
            other                      => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&transfer).unwrap()))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListTransfersQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let consumer_id = q
        .consumer_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid consumer_id"))?;

    let limit = q.limit.unwrap_or(20).clamp(1, 100);

    let before_id = q
        .before_id
        .map(|s| s.parse::<TransferId>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid before_id"))?;

    let mut transfers = state
        .transfer
        .list(consumer_id, limit + 1, q.before_created_at, before_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let has_more = transfers.len() as i64 > limit;
    transfers.truncate(limit as usize);

    Ok(Json(serde_json::json!({
        "data":     transfers,
        "has_more": has_more,
    })))
}
