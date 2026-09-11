use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_qr::{CreateDynamicQrRequest, CreateStaticQrRequest, QrEngine, QrError, QrOwnerType};
use banzami_types::Currency;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateStaticQrBody {
    pub owner_id: String,
    pub owner_type: String,
    pub currency: String,
    pub amount_minor: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateDynamicQrBody {
    pub owner_id: String,
    pub owner_type: String,
    pub currency: String,
    pub amount_minor: i64,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub reference: Option<String>,
    /// ADR-042: optionally bind this QR to a segregated wallet account of the
    /// owner (e.g. a DOA campaign account) so payments route there.
    pub wallet_account_id: Option<String>,
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
        _ => Err(ApiError::bad_request(
            "owner_type must be CONSUMER or MERCHANT",
        )),
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

    // ADR-042: a bound segregated account must belong to the owner MERCHANT wallet,
    // be ACTIVE, and match the QR currency. Validated here for early feedback; the
    // transfer engine re-checks at pay time (authoritative).
    let wallet_account_id = match body.wallet_account_id.as_deref() {
        None => None,
        Some(raw) => {
            let wa_id = uuid::Uuid::parse_str(raw)
                .map_err(|_| ApiError::bad_request("invalid wallet_account_id"))?;
            let ok: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM wallet_accounts
                  WHERE id = $1 AND wallet_id = $2 AND currency = $3 AND status = 'ACTIVE'",
            )
            .bind(wa_id)
            .bind(owner_id)
            .bind(currency.code())
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?;
            if ok.is_none() {
                return Err(ApiError::unprocessable(
                    "INVALID_WALLET_ACCOUNT",
                    "wallet_account_id must be an active account of the owner wallet in this currency",
                ));
            }
            Some(wa_id)
        }
    };

    let qr = state
        .qr
        .create_dynamic(CreateDynamicQrRequest {
            owner_id,
            owner_type,
            currency,
            amount_minor: body.amount_minor,
            expires_at: body.expires_at,
            reference: body.reference,
            wallet_account_id,
        })
        .await
        .map_err(|e| match e {
            QrError::AlreadyExpired => ApiError::bad_request("expires_at is in the past"),
            other => ApiError::internal(other.to_string()),
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

    let qr = state.qr.get(qr_id).await.map_err(|e| match e {
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        other => ApiError::internal(other.to_string()),
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
    let parsed = state.qr.decode(&body.payload).map_err(|e| match e {
        QrError::InvalidPayload(msg) => ApiError::bad_request(msg),
        other => ApiError::internal(other.to_string()),
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

    let qr = state.qr.mark_used(qr_id).await.map_err(|e| match e {
        QrError::NotFound(_) => ApiError::not_found("QR code not found"),
        QrError::AlreadyExpired => ApiError::unprocessable("QR_EXPIRED", "QR code has expired"),
        QrError::AlreadyUsedOrExpired => {
            ApiError::unprocessable("QR_ALREADY_USED", "QR code has already been used")
        }
        QrError::CannotMarkStaticAsUsed => {
            ApiError::bad_request("static QR codes cannot be marked as used")
        }
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&qr).unwrap()))
}
