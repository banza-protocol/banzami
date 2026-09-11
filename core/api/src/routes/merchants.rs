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
    /// ADR-028: optional business account type (defaults to MERCHANT in core).
    pub business_account_type: Option<String>,
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
            business_account_type: body.business_account_type.clone(),
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
    /// "LIVE" or "SANDBOX" — required. It used to default to LIVE when
    /// omitted, minting a real-money key for a caller that forgot to say.
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

    let environment = body
        .environment
        .as_deref()
        .and_then(ApiKeyEnvironment::parse)
        .ok_or_else(|| ApiError::bad_request("environment must be SANDBOX or LIVE"))?;

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

/// DELETE /internal/v1/merchants/:id/api-keys/:key_id
///
/// The merchant in the path is the key's owner, not decoration: a key that is
/// not `:id`'s answers 404 exactly like one that does not exist.
pub async fn revoke_api_key(
    State(state): State<AppState>,
    Path((merchant_id, key_id)): Path<(String, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = merchant_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let key_id: ApiKeyId = key_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid api key id"))?;

    let key = state
        .merchant
        .revoke_api_key(merchant_id, key_id)
        .await
        .map_err(|e| match e {
            MerchantError::ApiKeyNotFound(_) => ApiError::not_found("API key not found"),
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(serde_json::to_value(&key).unwrap()))
}

/// PATCH /internal/v1/merchants/:id/verified — retired.
///
/// "Verified" used to be a flag anyone with this route could set, beside the
/// KYB decision every gate actually reads (`merchant_compliance.kyb_status`).
/// The two disagreed. Migration 0122 made `merchants.verified` a projection the
/// database keeps from the KYB decision, so a write here would be silently
/// overruled; answering 409 says so instead. Verification changes through a
/// KYB decision: an application approved or linked in BANZADMIN, a completed
/// document review, or an operator's compliance action.
pub async fn set_verified(
    Path(_id): Path<String>,
    Json(_body): Json<serde_json::Value>,
) -> ApiResult<Json<serde_json::Value>> {
    Err(ApiError::conflict(
        "VERIFICATION_IS_THE_KYB_DECISION",
        "verified follows the KYB decision; decide KYB instead",
    ))
}

/// ADR-028: re-tag a Business Account's operator type (e.g. mark @doa APPLICATION).
pub async fn set_business_account_type(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> ApiResult<Json<serde_json::Value>> {
    let merchant_id: MerchantId = id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid merchant id"))?;
    let account_type = body
        .get("business_account_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_request("'business_account_type' is required"))?;

    let before: Option<String> =
        sqlx::query_scalar("SELECT business_account_type FROM merchants WHERE id = $1")
            .bind(merchant_id.as_uuid())
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.to_string()))?
            .flatten();

    let merchant = state
        .merchant
        .set_business_account_type(merchant_id, account_type)
        .await
        .map_err(|e| match e {
            MerchantError::NotFound(_) => ApiError::not_found("merchant not found"),
            MerchantError::InvalidBusinessAccountType(t) => {
                ApiError::bad_request(format!("invalid business_account_type: {t}"))
            }
            other => ApiError::internal(other.to_string()),
        })?;

    // The system trail, beside the operator's own audit in admin-api. The class
    // decides whether an account may receive an application fee, so a change to
    // it is recorded where every other change to what an account may receive is.
    super::risk::audit(
        &state.pool,
        "OPERATOR",
        "BUSINESS_ACCOUNT_TYPE_CHANGED",
        &format!("merchant:{}", merchant_id.as_uuid()),
        serde_json::json!({
            "from": before,
            "to": merchant.business_account_type,
            "source": "operator_classification",
        }),
        None,
    )
    .await;

    Ok(Json(serde_json::to_value(&merchant).unwrap()))
}

// ---------------------------------------------------------------------------
// Pricing profile assignment (operator-governed)
// ---------------------------------------------------------------------------

/// Which pricing policy applies to this financial owner.
///
/// This is the operator's decision and lives here rather than being inferred,
/// because inferring it is what went wrong: the rate used to follow a substring
/// match on the merchant's own KYB category text, so a shop whose description
/// mentioned donations was priced as a donation platform. The profile is now
/// named explicitly, by whoever is entitled to decide it.
///
/// The route takes a profile CODE rather than an id: codes are what an operator
/// reasons about, and resolving one here means a caller cannot name a profile
/// that does not exist by passing a uuid that happens to parse.
#[derive(Deserialize)]
pub struct AssignPricingProfileBody {
    pub profile_code: String,
}

#[derive(Serialize)]
pub struct PricingProfileAssignment {
    pub merchant_id: String,
    pub profile_code: String,
    pub environment: String,
}

/// PUT /internal/v1/merchants/:id/pricing-profile
///
/// Environment is checked here as well as by the database trigger. Two guards
/// for one rule is deliberate: this one gives a caller a usable error, and the
/// trigger is what holds if some future path forgets to ask.
pub async fn assign_pricing_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AssignPricingProfileBody>,
) -> ApiResult<Json<PricingProfileAssignment>> {
    let merchant_id =
        uuid::Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("invalid merchant id"))?;

    let code = body.profile_code.trim().to_string();
    if code.is_empty() {
        return Err(ApiError::bad_request("profile_code is required"));
    }

    let profile = sqlx::query_as::<_, (uuid::Uuid, String, bool)>(
        "SELECT id, environment, enabled FROM pricing_profiles WHERE code = $1",
    )
    .bind(&code)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .ok_or_else(|| ApiError::not_found("pricing profile not found"))?;

    if !profile.2 {
        return Err(ApiError::bad_request("pricing profile is disabled"));
    }
    if profile.1 != "SANDBOX" {
        // Financial LIVE is fail-closed; a LIVE profile has no business being
        // assigned by anything reachable from here.
        return Err(ApiError::bad_request(
            "only SANDBOX pricing profiles may be assigned on this deployment",
        ));
    }

    let updated = sqlx::query_scalar::<_, uuid::Uuid>(
        "UPDATE merchants SET pricing_profile_id = $1, updated_at = now()
          WHERE id = $2 RETURNING id",
    )
    .bind(profile.0)
    .bind(merchant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?;

    if updated.is_none() {
        return Err(ApiError::not_found("merchant not found"));
    }

    Ok(Json(PricingProfileAssignment {
        merchant_id: merchant_id.to_string(),
        profile_code: code,
        environment: profile.1,
    }))
}
