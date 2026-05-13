use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_transactions::{
    AuthorizeRequest, CaptureRequest, CreateTransactionRequest, FailRequest,
    ReverseRequest, TransactionEngine, TransactionError, TransactionType,
};
use banzami_types::{Currency, MerchantId, Money, TransactionId, WalletId};

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateTransactionBody {
    pub idempotency_key:  String,
    pub transaction_type: String,
    pub amount_minor:     i64,
    pub currency:         String,
    pub merchant_id:      String,
    pub wallet_id:        String,
    pub description:      Option<String>,
}

#[derive(Deserialize)]
pub struct FailBody {
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateTransactionBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let tx_type = TransactionType::try_from_str(&body.transaction_type)
        .ok_or_else(|| ApiError::bad_request(format!("unknown transaction_type: {}", body.transaction_type)))?;

    let merchant_id: MerchantId = body
        .merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant_id"))?;

    let wallet_id: WalletId = body
        .wallet_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid wallet_id"))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let tx = state
        .tx_engine
        .create(CreateTransactionRequest {
            idempotency_key:  body.idempotency_key,
            transaction_type: tx_type,
            amount:           Money::new(body.amount_minor, currency),
            merchant_id,
            wallet_id,
            description:      body.description,
        })
        .await
        .map_err(|e| match e {
            TransactionError::DuplicateIdempotencyKey(_) => {
                ApiError::conflict("duplicate idempotency key")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(&tx).unwrap())))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .get(tx_id)
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn authorize(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .authorize(AuthorizeRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn capture(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .capture(CaptureRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn reverse(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .reverse(ReverseRequest { tx_id })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}

pub async fn fail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let tx_id: TransactionId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid transaction id"))?;

    let tx = state
        .tx_engine
        .fail(FailRequest { tx_id, reason: body.reason })
        .await
        .map_err(|e| match e {
            TransactionError::NotFound(_) => ApiError::not_found("transaction not found"),
            TransactionError::InvalidStatusTransition { from, to } => ApiError::unprocessable(
                "INVALID_TRANSITION",
                format!("cannot transition {from:?} → {to:?}"),
            ),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&tx).unwrap()))
}
