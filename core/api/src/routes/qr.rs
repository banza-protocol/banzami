use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_qr::{
    CreateDynamicQrRequest, CreateStaticQrRequest, QrEngine, QrError, QrOwnerType,
};
use banzami_types::Currency;

use crate::{error::{ApiError, ApiResult}, state::AppState};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateStaticQrBody {
    pub owner_id:     String,
    pub owner_type:   String,
    pub currency:     String,
    pub amount_minor: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateDynamicQrBody {
    pub owner_id:    String,
    pub owner_type:  String,
    pub currency:    String,
    pub amount_minor: i64,
    pub expires_at:  chrono::DateTime<chrono::Utc>,
    pub reference:   Option<String>,
}

#[derive(Deserialize)]
pub struct DecodeQrBody {
    pub payload: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_owner_type(s: &str) -> Result<QrOwnerType, ApiError> {
    match s.to_uppercase().as_str() {
        "CONSUMER" => Ok(QrOwnerType::Consumer),
        "MERCHANT" => Ok(QrOwnerType::Merchant),
        _          => Err(ApiError::bad_request("owner_type must be CONSUMER or MERCHANT")),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn create_static(
    State(state): State<AppState>,
    Json(body): Json<CreateStaticQrBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let owner_id: uuid::Uuid = body
        .owner_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let owner_type = parse_owner_type(&body.owner_type)?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    let qr = state
        .qr
        .create_static(CreateStaticQrRequest {
            owner_id,
            owner_type,
            currency,
            amount_minor: body.amount_minor,
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "qr_code": qr,
            "payload": payload,
        })),
    ))
}

pub async fn create_dynamic(
    State(state): State<AppState>,
    Json(body): Json<CreateDynamicQrBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let owner_id: uuid::Uuid = body
        .owner_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid owner_id"))?;
    let owner_type = parse_owner_type(&body.owner_type)?;
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;

    if body.amount_minor <= 0 {
        return Err(ApiError::bad_request("amount_minor must be positive"));
    }

    let qr = state
        .qr
        .create_dynamic(CreateDynamicQrRequest {
            owner_id,
            owner_type,
            currency,
            amount_minor: body.amount_minor,
            expires_at: body.expires_at,
            reference: body.reference,
        })
        .await
        .map_err(|e| match e {
            QrError::AlreadyExpired => ApiError::bad_request("expires_at is in the past"),
            other                   => ApiError::internal(other.to_string()),
        })?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "qr_code": qr,
            "payload": payload,
        })),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let qr_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid QR code id"))?;

    let qr = state
        .qr
        .get(qr_id)
        .await
        .map_err(|e| match e {
            QrError::NotFound(_) => ApiError::not_found("QR code not found"),
            other                => ApiError::internal(other.to_string()),
        })?;

    let payload = state
        .qr
        .encode(&qr)
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "qr_code": qr,
        "payload": payload,
    })))
}

pub async fn decode(
    State(state): State<AppState>,
    Json(body): Json<DecodeQrBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let parsed = state
        .qr
        .decode(&body.payload)
        .map_err(|e| match e {
            QrError::InvalidPayload(msg) => ApiError::bad_request(msg),
            other                        => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&parsed).unwrap()))
}

pub async fn mark_used(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let qr_id = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid QR code id"))?;

    let qr = state
        .qr
        .mark_used(qr_id)
        .await
        .map_err(|e| match e {
            QrError::NotFound(_)           => ApiError::not_found("QR code not found"),
            QrError::AlreadyExpired        => {
                ApiError::unprocessable("QR_EXPIRED", "QR code has expired")
            }
            QrError::AlreadyUsedOrExpired  => {
                ApiError::unprocessable("QR_ALREADY_USED", "QR code has already been used")
            }
            QrError::CannotMarkStaticAsUsed => {
                ApiError::bad_request("static QR codes cannot be marked as used")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&qr).unwrap()))
}
