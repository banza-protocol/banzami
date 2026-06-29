//! Internal Application Settlement API (Banzami ADR-021 / BANZA ADR-039).
//!
//! OPERATOR-ONLY surface (reached only via the internal `/internal/v1` boundary;
//! never exposed by the public gateway). The caller supplies **references and
//! accounts only** — never a fee or a percentage. The application fee is resolved
//! internally by the Pricing Engine; the client can neither choose nor send it.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use banzami_app_settlement::{
    ApplicationSettlementEngine, ApplicationSettlementError, CreateApplicationSettlementRequest,
};
use banzami_types::{AccountId, ApplicationSettlementId, Currency, Money};

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Deserialize)]
pub struct CreateBody {
    pub idempotency_key: String,
    pub owner_ref: String,
    pub application_id: Option<String>,
    pub source_account_id: String,
    pub beneficiary_account_id: String,
    /// Required only when a non-zero application fee is resolved.
    pub application_fee_account_id: Option<String>,
    pub gross_amount_minor: i64,
    pub currency: String,
    // References only — never a fee/percentage. A client-supplied rate/fee field
    // is not modelled here and is therefore ignored: the client cannot set a fee.
    pub business_category: Option<String>,
    pub pricing_profile: Option<String>,
    pub fee_policy_ref: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct FailBody {
    pub reason: String,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub owner_ref: String,
    pub limit: Option<i64>,
}

fn map_err(e: ApplicationSettlementError) -> ApiError {
    use ApplicationSettlementError as E;
    match e {
        E::NotFound(_) => ApiError::not_found("application settlement not found"),
        E::InvalidAmount => ApiError::bad_request("gross amount must be positive"),
        E::CurrencyMismatch => ApiError::bad_request("currency mismatch"),
        E::FeeExceedsGross { .. } => {
            ApiError::unprocessable("FEE_EXCEEDS_GROSS", "resolved application fee exceeds gross")
        }
        E::MissingFeeAccount { .. } => {
            ApiError::bad_request("application_fee_account_id is required for this category")
        }
        E::InsufficientFunds { .. } => {
            ApiError::unprocessable("INSUFFICIENT_FUNDS", "source account has insufficient funds")
        }
        E::InvalidStatus { .. } => {
            ApiError::conflict("INVALID_STATUS", "invalid settlement status transition")
        }
        other => ApiError::internal(other.to_string()),
    }
}

fn parse_account(s: &str, field: &str) -> Result<AccountId, ApiError> {
    s.parse()
        .map_err(|_| ApiError::bad_request(format!("invalid {field}")))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let currency = Currency::from_code(&body.currency)
        .ok_or_else(|| ApiError::bad_request(format!("unsupported currency: {}", body.currency)))?;
    if body.gross_amount_minor <= 0 {
        return Err(ApiError::bad_request("gross_amount_minor must be positive"));
    }
    let source_account_id = parse_account(&body.source_account_id, "source_account_id")?;
    let beneficiary_account_id =
        parse_account(&body.beneficiary_account_id, "beneficiary_account_id")?;
    let application_fee_account_id = body
        .application_fee_account_id
        .as_deref()
        .map(|s| parse_account(s, "application_fee_account_id"))
        .transpose()?;

    let settlement = state
        .app_settlement
        .create(CreateApplicationSettlementRequest {
            idempotency_key: body.idempotency_key,
            owner_ref: body.owner_ref,
            application_id: body.application_id,
            source_account_id,
            beneficiary_account_id,
            application_fee_account_id,
            gross_amount: Money::new(body.gross_amount_minor, currency),
            business_category: body.business_category,
            pricing_profile: body.pricing_profile,
            fee_policy_ref: body.fee_policy_ref,
            metadata: body.metadata,
        })
        .await
        .map_err(map_err)?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::to_value(&settlement).unwrap()),
    ))
}

fn parse_id(id: &str) -> Result<ApplicationSettlementId, ApiError> {
    id.parse()
        .map_err(|_| ApiError::bad_request("invalid settlement id"))
}

pub async fn complete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state.app_settlement.complete(parse_id(&id)?).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state.app_settlement.cancel(parse_id(&id)?).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn fail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state
        .app_settlement
        .fail(parse_id(&id)?, body.reason)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let s = state.app_settlement.get(parse_id(&id)?).await.map_err(map_err)?;
    Ok(Json(serde_json::to_value(&s).unwrap()))
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let items = state
        .app_settlement
        .list_by_owner(&q.owner_ref, state.environment.as_str(), limit)
        .await
        .map_err(map_err)?;
    Ok(Json(serde_json::json!({ "data": items })))
}
