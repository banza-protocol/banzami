use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use banzami_merchants::{ApiKeyEnvironment, CreateMerchantRequest, MerchantEngine, MerchantError};
use banzami_types::{ApiKeyId, MerchantId};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Request / response bodies
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateMerchantBody {
    pub name: String,
    pub email: String,
}

#[derive(Deserialize)]
pub struct VerifyApiKeyBody {
    pub raw_key: String,
}

#[derive(Serialize)]
pub struct VerifyApiKeyResponse {
    pub merchant_id: String,
    pub merchant_name: String,
    pub merchant_status: String,
    pub environment: String, // "LIVE" | "SANDBOX"
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ListQuery {
    pub search: Option<String>,
}

pub async fn list_merchants(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchants = state
        .merchant
        .list(q.search.as_deref())
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::to_value(&merchants).unwrap()))
}

pub async fn create_merchant(
    State(state): State<AppState>,
    Json(body): Json<CreateMerchantBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    if body.name.trim().is_empty() || body.email.trim().is_empty() {
        return Err(ApiError::bad_request("name and email are required"));
    }

    let merchant = state
        .merchant
        .create(CreateMerchantRequest {
            name: body.name,
            email: body.email,
        })
        .await
        .map_err(|e| match e {
            MerchantError::DuplicateEmail(email) => {
                ApiError::conflict("CONFLICT", format!("email already registered: {email}"))
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&merchant).unwrap()),
    ))
}

pub async fn get_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let merchant = state.merchant.get(merchant_id).await.map_err(|e| match e {
        MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
        other => ApiError::internal(other.to_string()),
    })?;

    Ok(Json(serde_json::to_value(&merchant).unwrap()))
}

pub async fn verify_api_key(
    State(state): State<AppState>,
    Json(body): Json<VerifyApiKeyBody>,
) -> ApiResult<Json<VerifyApiKeyResponse>> {
    if body.raw_key.is_empty() {
        return Err(ApiError::bad_request("raw_key is required"));
    }

    let (key, merchant) =
        state
            .merchant
            .verify_api_key(&body.raw_key)
            .await
            .map_err(|e| match e {
                MerchantError::RevokedApiKey(_) => {
                    ApiError::unprocessable("KEY_REVOKED", "API key has been revoked")
                }
                MerchantError::InvalidApiKey => {
                    ApiError::unprocessable("INVALID_API_KEY", "invalid API key")
                }
                other => ApiError::internal(other.to_string()),
            })?;

    Ok(Json(VerifyApiKeyResponse {
        merchant_id: merchant.id.to_string(),
        merchant_name: merchant.name,
        merchant_status: merchant.status.as_str().to_owned(),
        environment: key.environment.as_str().to_owned(),
    }))
}

pub async fn delete_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    state
        .merchant
        .delete(merchant_id)
        .await
        .map_err(|e| match e {
            MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn suspend_merchant(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let merchant = state
        .merchant
        .suspend(merchant_id)
        .await
        .map_err(|e| match e {
            MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&merchant).unwrap()))
}

#[derive(Deserialize)]
pub struct CreateApiKeyBody {
    pub name: String,
    /// "LIVE" or "SANDBOX" — defaults to "LIVE" if omitted.
    pub environment: Option<String>,
}

pub async fn create_api_key(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateApiKeyBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    if body.name.trim().is_empty() {
        return Err(ApiError::bad_request("name is required"));
    }

    let environment = match body.environment.as_deref() {
        Some("SANDBOX") => ApiKeyEnvironment::Sandbox,
        _ => ApiKeyEnvironment::Live,
    };

    let key_secret = state
        .merchant
        .create_api_key(merchant_id, body.name, environment)
        .await
        .map_err(|e| match e {
            MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
            MerchantError::NotActive(_) => {
                ApiError::unprocessable("MERCHANT_INACTIVE", "merchant is not active")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&key_secret).unwrap()),
    ))
}

pub async fn list_api_keys(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let keys = state
        .merchant
        .list_api_keys(merchant_id)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(serde_json::to_value(&keys).unwrap()))
}

pub async fn revoke_api_key(
    State(state): State<AppState>,
    Path((_, key_id)): Path<(String, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    let key_id: ApiKeyId = key_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid api key id"))?;

    let key = state
        .merchant
        .revoke_api_key(key_id)
        .await
        .map_err(|e| match e {
            MerchantError::ApiKeyNotFound(_) => ApiError::not_found("API key not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&key).unwrap()))
}

/// PATCH /internal/v1/merchants/:id/verified
///
/// Sets or clears the merchant verification flag.
/// Body: `{"verified": true | false}`
pub async fn set_verified(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let verified = body
        .get("verified")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| ApiError::bad_request("'verified' must be a boolean"))?;

    let merchant = state
        .merchant
        .set_verified(merchant_id, verified)
        .await
        .map_err(|e| match e {
            MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&merchant).unwrap()))
}
